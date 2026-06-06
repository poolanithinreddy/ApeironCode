/**
 * Phase 16H — Runtime brain context builder.
 * Reads Project Brain, classifies intent, selects token-efficient context.
 * No writes. No secrets. No script execution.
 */

import {classifyRuntimeBrainIntent, type RuntimeBrainIntentResult} from './runtimeIntent.js';
import {detectBrainContextIntent, selectBrainFilesForPrompt, explainBrainContextSelection, type BrainContextSelection} from './brainContextPlanner.js';
import {createAgentRoutingPlan, type AgentRoutingPlan} from './agentRouter.js';
import {detectLargeAppBuildIntent, formatAppBuildPlan, createAppBuildPlan} from './appBuildPlanner.js';
import {formatContinuationContext} from './continuation.js';
import {readProjectBrain} from './reader.js';
import {redactProjectBrainText, truncateForPrompt} from './safety.js';
import type {ProjectBrainSummary} from './types.js';

export interface RuntimeBrainContext {
  /** Classified intent from the prompt. */
  intentResult: RuntimeBrainIntentResult;
  /** Whether Project Brain exists in cwd. */
  brainPresent: boolean;
  /** Short summary of brain status (redacted). */
  brainStatusLine: string;
  /** Selected brain file sections for token-efficient injection. */
  contextSelection: BrainContextSelection | null;
  /** Routing plan (agents/skills). */
  routingPlan: AgentRoutingPlan | null;
  /** Compact text ready to inject into system prompt. Max ~900 tokens. */
  promptInjection: string;
  /** Debug explanation of how context was selected. */
  debugExplanation: string;
  /** Warnings (e.g. brain missing, stale files, etc.). */
  warnings: string[];
  /** Estimated token cost of injection. */
  estimatedTokens: number;
}

export interface BuildRuntimeBrainContextOptions {
  tokenBudget?: number;
  skipRouting?: boolean;
  skipFileSelection?: boolean;
}

const NO_BRAIN_SUGGESTION =
  'Project Brain not found. Consider `apeironcode brain plan` to preview optional per-project context files.';

// ─── Main entry point ────────────────────────────────────────────────────────

export const buildRuntimeBrainContext = async (
  cwd: string,
  prompt: string,
  options: BuildRuntimeBrainContextOptions = {},
): Promise<RuntimeBrainContext> => {
  const tokenBudget = options.tokenBudget ?? 900;
  const intentResult = classifyRuntimeBrainIntent(prompt);
  const warnings: string[] = [];

  // Fast path: no brain needed for this intent
  if (!intentResult.useBrain) {
    return {
      intentResult, brainPresent: false, brainStatusLine: '',
      contextSelection: null, routingPlan: null,
      promptInjection: '', debugExplanation: 'Intent does not require Project Brain context.',
      warnings, estimatedTokens: 0,
    };
  }

  // Read brain (safe, summary-only, no secrets)
  let summary: ProjectBrainSummary | null = null;
  let brainPresent = false;
  try {
    const brain = await readProjectBrain(cwd, {maxCharsPerFile: 100});
    brainPresent = brain.exists;
    summary = brain.summary;
  } catch {
    warnings.push('Could not read Project Brain summary.');
  }

  if (!brainPresent || !summary) {
    const injection = intentResult.intent === 'large-app-build'
      ? buildLargeAppSuggestion(prompt)
      : intentResult.intent === 'continue'
        ? 'Project Brain not found. Resume from your last context manually.'
        : '';
    return {
      intentResult, brainPresent: false,
      brainStatusLine: NO_BRAIN_SUGGESTION,
      contextSelection: null, routingPlan: null,
      promptInjection: injection,
      debugExplanation: NO_BRAIN_SUGGESTION,
      warnings: [...warnings, NO_BRAIN_SUGGESTION],
      estimatedTokens: Math.ceil(injection.length * 0.25),
    };
  }

  const brainStatusLine = redactProjectBrainText(`Project Brain: ${summary.status} | ${summary.keyFilesPresent.length} files`);

  // Continuation: use dedicated continuation context
  if (intentResult.intent === 'continue') {
    let continuationText = '';
    try {
      continuationText = await formatContinuationContext(cwd);
    } catch {
      warnings.push('Could not load continuation context.');
    }
    const truncated = truncateForPrompt(continuationText, tokenBudget * 4);
    return {
      intentResult, brainPresent: true, brainStatusLine,
      contextSelection: null, routingPlan: null,
      promptInjection: truncated ? `\n\n## Project Brain Continuation Context\n${truncated}` : '',
      debugExplanation: 'Continuation intent: loaded PLAN/TASKS/RUNS summary.',
      warnings,
      estimatedTokens: Math.ceil(truncated.length * 0.25),
    };
  }

  // Large app build: inject orchestration plan suggestion
  if (intentResult.intent === 'large-app-build') {
    const injection = buildLargeAppSuggestion(prompt);
    return {
      intentResult, brainPresent: true, brainStatusLine,
      contextSelection: null, routingPlan: null,
      promptInjection: injection,
      debugExplanation: 'Large app build intent: injected plan-first orchestration suggestion.',
      warnings,
      estimatedTokens: Math.ceil(injection.length * 0.25),
    };
  }

  // General path: select token-efficient brain context
  let contextSelection: BrainContextSelection | null = null;
  if (!options.skipFileSelection) {
    detectBrainContextIntent(prompt);
    contextSelection = selectBrainFilesForPrompt(prompt, summary, {tokenBudget});
  }

  // Routing plan (no-op for simple prompts)
  let routingPlan: AgentRoutingPlan | null = null;
  if (!options.skipRouting) {
    routingPlan = createAgentRoutingPlan(prompt, {maxAgents: 2, maxSkills: 2, tokenBudget});
    if (routingPlan.executionMode === 'no-agent') routingPlan = null;
  }

  const injection = buildInjectionText(brainStatusLine, contextSelection, routingPlan, tokenBudget);
  const debugExplanation = contextSelection
    ? explainBrainContextSelection(contextSelection)
    : 'No specific brain files selected for this intent.';

  return {
    intentResult, brainPresent: true, brainStatusLine,
    contextSelection, routingPlan,
    promptInjection: injection,
    debugExplanation,
    warnings,
    estimatedTokens: Math.ceil(injection.length * 0.25),
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildLargeAppSuggestion = (prompt: string): string => {
  if (!detectLargeAppBuildIntent(prompt)) return '';
  const plan = createAppBuildPlan(prompt);
  const formatted = formatAppBuildPlan(plan).slice(0, 2_000);
  return redactProjectBrainText(
    `\n\n## Plan-First: Large App Build Detected\n${formatted}\n\n` +
    `> Tip: Run \`apeironcode brain init\` to create Project Brain files tracking this build.`,
  );
};

const buildInjectionText = (
  statusLine: string,
  selection: BrainContextSelection | null,
  routing: AgentRoutingPlan | null,
  tokenBudget: number,
): string => {
  const parts: string[] = [];
  if (statusLine) parts.push(`**${statusLine}**`);
  if (selection && selection.selectedFiles.length > 0) {
    const fileList = selection.selectedFiles
      .map((f) => `- ${f.relativePath} (${f.reason})`)
      .join('\n');
    parts.push(`Brain context selected:\n${fileList}`);
  }
  if (routing && routing.selectedAgents.length > 0) {
    const agents = routing.selectedAgents.map((a) => `${a.name} (${a.role})`).join(', ');
    parts.push(`Suggested agents: ${agents}`);
  }
  if (parts.length === 0) return '';
  const text = `\n\n## Project Brain\n${parts.join('\n')}`;
  return truncateForPrompt(text, tokenBudget * 4);
};

// ─── Utility exports ─────────────────────────────────────────────────────────

export const shouldUseProjectBrain = (context: RuntimeBrainContext): boolean =>
  context.brainPresent && context.intentResult.useBrain && context.promptInjection.length > 0;

export const formatRuntimeBrainContextForPrompt = (
  context: RuntimeBrainContext,
  options: {compact?: boolean} = {},
): string => {
  if (!shouldUseProjectBrain(context)) return '';
  return options.compact
    ? context.promptInjection.slice(0, 600)
    : context.promptInjection;
};

export const formatRuntimeBrainContextDebug = (context: RuntimeBrainContext): string =>
  redactProjectBrainText([
    `Brain present: ${context.brainPresent}`,
    `Intent: ${context.intentResult.intent} (${(context.intentResult.confidence * 100).toFixed(0)}% confidence)`,
    `Use brain: ${context.intentResult.useBrain}`,
    `Estimated tokens: ${context.estimatedTokens}`,
    `Selected files: ${context.contextSelection?.selectedFiles.map((f) => f.relativePath).join(', ') ?? 'none'}`,
    `Routing mode: ${context.routingPlan?.executionMode ?? 'none'}`,
    context.warnings.length > 0 ? `Warnings: ${context.warnings.join('; ')}` : '',
    `Explanation: ${context.debugExplanation}`,
  ].filter(Boolean).join('\n'));
