import type {AgentMode} from '../agent/types.js';
import {estimateObjectTokens} from '../tokens/estimate.js';
import type {ToolDefinition} from './types.js';

export type ToolExposureMode = 'none' | 'minimal' | 'read-only' | 'debug' | 'edit' | 'test-fix' | 'review' | 'connector' | 'full';

export interface ToolExposureDecision {
  includedTools: string[];
  excludedTools: Array<{name: string; reason: string}>;
  estimatedSchemaTokens: number;
  explanation: string;
}

export interface ToolExposureOptions {
  forceFull?: boolean;
  maxSchemaTokens?: number;
  providerCapabilities?: {nativeToolCalling: boolean};
  runtimeState?: string;
  /** command_output is only exposed when a background command session exists. */
  hasActiveCommandSession?: boolean;
}

// command_output requires a real background-session sessionId. Exposing it by
// default invited `command_output requires sessionId` failures.
const COMMAND_SESSION = new Set(['command_output']);

const READ_ONLY = new Set(['read_file', 'list_files', 'file_info', 'glob', 'grep', 'project_tree', 'package_info']);
const DEBUG = new Set([...READ_ONLY, 'run_command', 'command_status', 'command_output', 'test_runner', 'lint_runner']);
const EDIT = new Set([...DEBUG, 'edit_file', 'patch_file', 'write_file', 'revert_patch']);
const REVIEW = new Set([...READ_ONLY, 'git_status', 'git_diff', 'git_log', 'git_branch']);
const CONNECTOR_PREFIXES = ['github_', 'linear_', 'jira_', 'slack_'];
// todo_write is NOT exposed by default — it derailed real app build/run/fix
// flows. It is only offered in explicit planning/task-management contexts.
const PLANNING = new Set(['todo_write']);
const PLANNING_RE =
  /\b(todo list|task list|break (?:this|it|the task) down|checklist|plan the work|track (?:the )?tasks?|planning mode|manage tasks)\b/iu;
const SAFETY_ALWAYS = new Set<string>();

const isPlanningContext = (prompt: string, mode?: string): boolean =>
  mode === 'plan' || mode === 'plan-only' || PLANNING_RE.test(prompt);

// Greeting / capability questions never need tools.
const PURE_CHAT_RE = /^\s*(hi|hey|hello|yo|sup|hiya|howdy|good (?:morning|afternoon|evening)|thanks?|thank you|ok(?:ay)?|cool|nice|great|who are you|what can you do|what are you|how do you work|what is apeironcode|tell me about yourself)\b[\s!.?]*$/iu;

// Phase 17E: explicit write / run / build / mutation intent. Without one of
// these (and absent an explicit agentMode), a prompt has no business being
// in edit mode — the safer fallback is read-only. Real app build / modify /
// fix flows route through the deterministic agentRouter BEFORE exposure
// policy runs, so this default does not weaken them.
const WRITE_RUN_INTENT_RE =
  /\b(write|create|add|update|edit|change|modify|implement|build|generate|scaffold|fix|patch|refactor|rename|delete|remove|install|uninstall|run|execute|start|launch|deploy|commit|push|pull|merge|test|configure|setup|set\s+up)\b/u;

export const classifyToolExposureMode = (prompt: string, agentMode?: AgentMode): ToolExposureMode => {
  const lower = prompt.toLowerCase();
  if (PURE_CHAT_RE.test(prompt.trim())) return 'none';
  if (/all tools|full tool/u.test(lower)) return 'full';
  if (/github|linear|jira|slack|issue|pull request|connector/u.test(lower)) return 'connector';
  if (agentMode === 'explain' || /^summari[sz]e|explain|read/u.test(lower)) return 'read-only';
  if (agentMode === 'review' || /review|diff|pull request/u.test(lower)) return 'review';
  if (agentMode === 'debug' || /debug|diagnos|stack trace|error/u.test(lower)) return 'debug';
  if (agentMode === 'test-fix' || /test|failing spec|vitest|jest/u.test(lower)) return 'test-fix';
  if (agentMode === 'edit' || agentMode === 'feature' || agentMode === 'fix' || /implement|edit|write|fix|patch/u.test(lower)) return 'edit';
  // No specific mode and no explicit write/run intent: stay read-only so an
  // ambiguous question (e.g. "why is my function returning undefined?") does
  // not get write_file / run_command in its tool surface.
  if (!WRITE_RUN_INTENT_RE.test(lower)) return 'read-only';
  return lower.trim().split(/\s+/u).length <= 5 ? 'minimal' : 'edit';
};

const connectorMatchesPrompt = (toolName: string, prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  return CONNECTOR_PREFIXES.some((prefix) => toolName.startsWith(prefix) && lower.includes(prefix.slice(0, -1)));
};

const toolsForMode = (mode: ToolExposureMode): Set<string> | null => {
  switch (mode) {
    case 'none': return new Set();
    case 'minimal': return new Set(['read_file', 'grep', 'glob', 'package_info', 'project_tree']);
    case 'read-only': return READ_ONLY;
    case 'debug': return DEBUG;
    case 'test-fix': return new Set([...EDIT, 'test_runner', 'lint_runner', 'build_runner']);
    case 'review': return REVIEW;
    case 'edit': return EDIT;
    case 'connector': return null;
    case 'full': return null;
  }
};

export const selectToolsForPrompt = (
  prompt: string,
  mode: AgentMode | ToolExposureMode | undefined,
  allTools: ToolDefinition[],
  options: ToolExposureOptions = {},
): ToolExposureDecision => {
  if (options.providerCapabilities && !options.providerCapabilities.nativeToolCalling) {
    return {
      estimatedSchemaTokens: 0,
      excludedTools: allTools.map((tool) => ({name: tool.name, reason: 'provider does not support native tool calling'})),
      explanation: 'Selected 0 tools because the active provider does not support native tool calling.',
      includedTools: [],
    };
  }
  const exposureMode = options.forceFull || mode === 'full'
    ? 'full'
    : classifyToolExposureMode(prompt, mode as AgentMode | undefined);
  if (exposureMode === 'none') {
    return {
      estimatedSchemaTokens: 0,
      excludedTools: allTools.map((tool) => ({name: tool.name, reason: 'pure chat needs no tools'})),
      explanation: 'Selected 0 tools because the prompt is plain conversation.',
      includedTools: [],
    };
  }
  const allowList = toolsForMode(exposureMode);
  const included: ToolDefinition[] = [];
  const excludedTools: ToolExposureDecision['excludedTools'] = [];

  const planningContext = isPlanningContext(prompt, mode);
  for (const tool of allTools) {
    const isConnector = CONNECTOR_PREFIXES.some((prefix) => tool.name.startsWith(prefix));
    const isKnownPolicyTool = isConnector || READ_ONLY.has(tool.name) || DEBUG.has(tool.name) || EDIT.has(tool.name) || REVIEW.has(tool.name) || PLANNING.has(tool.name) || COMMAND_SESSION.has(tool.name);
    const include = COMMAND_SESSION.has(tool.name)
      ? (exposureMode === 'full' || options.hasActiveCommandSession === true)
      : PLANNING.has(tool.name)
      ? (exposureMode === 'full' || planningContext)
      : (exposureMode === 'full' ||
          !isKnownPolicyTool ||
          SAFETY_ALWAYS.has(tool.name) ||
          (exposureMode === 'connector' ? connectorMatchesPrompt(tool.name, prompt) : allowList?.has(tool.name)));
    if (include) {
      included.push(tool);
    } else {
      excludedTools.push({name: tool.name, reason: isConnector ? 'connector not relevant to prompt' : `not needed for ${exposureMode} mode`});
    }
  }

  let estimatedSchemaTokens = estimateObjectTokens(included.map((tool) => ({description: tool.description, name: tool.name})));

  if (options.maxSchemaTokens && estimatedSchemaTokens > options.maxSchemaTokens) {
    const removable = included
      .filter((tool) => !SAFETY_ALWAYS.has(tool.name))
      .sort((left, right) => estimateObjectTokens({description: right.description, name: right.name}) -
        estimateObjectTokens({description: left.description, name: left.name}));
    for (const tool of removable) {
      if (estimatedSchemaTokens <= options.maxSchemaTokens) break;
      const index = included.findIndex((candidate) => candidate.name === tool.name);
      if (index >= 0) {
        included.splice(index, 1);
        excludedTools.push({name: tool.name, reason: 'excluded to fit schema token budget'});
        estimatedSchemaTokens = estimateObjectTokens(included.map((candidate) => ({
          description: candidate.description,
          name: candidate.name,
        })));
      }
    }
    if (estimatedSchemaTokens > options.maxSchemaTokens) {
      included.splice(0, included.length);
      estimatedSchemaTokens = 0;
    }
  }

  return {
    estimatedSchemaTokens,
    excludedTools,
    explanation: `Selected ${included.length}/${allTools.length} tools for ${exposureMode} mode${options.maxSchemaTokens ? ` within ~${options.maxSchemaTokens} schema tokens` : ''}.`,
    includedTools: included.map((tool) => tool.name),
  };
};

const READONLY_NAMES = new Set([
  'read_file', 'list_files', 'file_info', 'glob', 'grep',
  'project_tree', 'package_info', 'git_status', 'git_diff', 'git_log', 'git_branch',
]);

const WRITE_NAMES = new Set(['edit_file', 'write_file', 'patch_file', 'revert_patch']);
const TEST_FIX_REQUIRED = new Set(['test_runner', 'lint_runner', 'edit_file']);

export interface ContextExposureOptions {
  mode?: string;
  prompt?: string;
  providerCapabilities?: {nativeToolCalling: boolean};
}

export const getExposedToolsForContext = (
  allTools: string[],
  context: ContextExposureOptions,
): string[] => {
  if (context.providerCapabilities && !context.providerCapabilities.nativeToolCalling) {
    return [];
  }
  const prompt = (context.prompt ?? '').toLowerCase();
  const mode = context.mode ?? '';

  if (mode === 'explain' || /\b(explain|describe|what is)\b/u.test(prompt)) {
    return allTools.filter((t) => READONLY_NAMES.has(t));
  }

  if (mode === 'test-fix') {
    const set = new Set<string>();
    for (const t of allTools) {
      if (TEST_FIX_REQUIRED.has(t) || READONLY_NAMES.has(t)) set.add(t);
    }
    return Array.from(set);
  }

  if (mode === 'edit' || mode === 'fix') {
    return allTools.filter((t) => READONLY_NAMES.has(t) || WRITE_NAMES.has(t) || TEST_FIX_REQUIRED.has(t));
  }

  if (/\b(github|pr|pull request|issue)\b/u.test(prompt)) {
    return allTools.filter((t) => t.startsWith('github_') || READONLY_NAMES.has(t));
  }

  if (/\b(mcp|model context protocol)\b/u.test(prompt)) {
    return allTools.filter((t) => t.startsWith('mcp_') || t.startsWith('mcp:') || READONLY_NAMES.has(t));
  }

  return allTools;
};
