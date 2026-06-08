import {createEventTimestamp} from '../core/events/events.js';
import type {EventBus} from '../core/events/bus.js';
import {createMemoryEntityId, upsertMemoryEdge, upsertMemoryFact} from '../memory/graph.js';
import {MemoryGraphStore} from '../memory/graphStore.js';
import {buildSessionMemorySuggestion, MemorySuggestionStore} from '../memory/suggestions.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {ResolvedConfig} from '../config/config.js';
import type {buildProjectContext} from './context.js';
import type {runAgentLoop} from './loop.js';
import type {MemoryManager, MemorySuggestion} from './memoryManager.js';
import type {AgentMode, AgentRunOptions} from './types.js';

export const canSuggestMemorySave = (): boolean => {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
};

const PROVIDER_OR_AUTH_FAILURE_RE =
  /\b400\b|\b401\b|\b403\b|\b413\b|\b422\b|\b429\b|unauthorized|forbidden|authentication failed|invalid api key|invalid token|expired token|missing models: read|provider returned \d|rejected the request payload|provider_bad_request|rate limit|quota exceeded|provider_auth_error/iu;
const TOOL_VALIDATION_FAILURE_RE =
  /\b(?:missing|required|requires?|omitted)\b.*\b(?:path|content|todos|todo items|command|search|replace)\b|tool_input_invalid|received invalid input|schema validation|invalid_type|zoderror/iu;
const TRIVIAL_PROMPT_RE = /^(hi|hello|hey|thanks|thank you|how are you)\??$/iu;

/**
 * A run is memory-eligible only if it produced useful evidence (a file
 * change, a command/test run, or a successful tool call) AND did not end in
 * a provider/auth failure. Auth failures and empty failed chats must never
 * trigger a "Save project memory" prompt.
 */
export const runProducedUsefulEvidence = (
  result: Awaited<ReturnType<typeof runAgentLoop>>,
): boolean => {
  const finalText = result.finalMessage.content ?? '';
  if (TRIVIAL_PROMPT_RE.test(finalText.trim())) {
    return false;
  }
  if (PROVIDER_OR_AUTH_FAILURE_RE.test(finalText)) {
    return false;
  }
  const taskState = result.taskState;
  const errorText = (taskState?.errors ?? []).join('\n');
  if (PROVIDER_OR_AUTH_FAILURE_RE.test(errorText)) {
    return false;
  }
  if (TOOL_VALIDATION_FAILURE_RE.test(finalText) || TOOL_VALIDATION_FAILURE_RE.test(errorText)) {
    return false;
  }
  if ((result.taskState?.errors.length ?? 0) > 0) {
    return false;
  }
  const successfulTools = (result.toolCalls ?? []).some(
    (call) => call.status === 'success',
  );
  const hasEvidence =
    (taskState?.filesChanged?.length ?? 0) > 0 ||
    (taskState?.commandsRun?.length ?? 0) > 0 ||
    (taskState?.testsRun?.length ?? 0) > 0 ||
    successfulTools;
  return hasEvidence;
};

export const maybePersistProjectMemory = async ({
  approvalManager,
  canPromptForApproval,
  eventBus,
  memoryManager,
  memoryConfig,
  mode,
  projectContext,
  prompt,
  result,
}: {
  approvalManager: ApprovalManager;
  canPromptForApproval: boolean;
  eventBus: EventBus;
  memoryManager: MemoryManager;
  memoryConfig: ResolvedConfig['effective']['memory'];
  mode: AgentMode;
  projectContext: Awaited<ReturnType<typeof buildProjectContext>>;
  prompt: string;
  result: Awaited<ReturnType<typeof runAgentLoop>>;
}): Promise<MemorySuggestion[]> => {
  if (TRIVIAL_PROMPT_RE.test(prompt.trim())) {
    return [];
  }
  // Never propose project memory for failed/auth-failed runs that produced
  // no useful work — no "pitfall: Provider returned 401", no architecture
  // facts harvested from a run that failed before doing anything useful.
  if (!runProducedUsefulEvidence(result)) {
    return [];
  }

  const candidate = memoryManager.extractProjectMemoryFromRun({
    goal: prompt,
    mode,
    projectScan: projectContext.projectScan,
    relevantFiles: projectContext.relevantFiles.map((file) => file.path),
    summary: result.finalMessage.content,
    taskState: result.taskState,
  });

  if (!memoryManager.hasMeaningfulProjectMemory(candidate)) {
    return [];
  }

  const categorizedSuggestions = memoryManager.buildMemorySuggestions(candidate);
  const preview = memoryManager.formatMemorySuggestionPreview(candidate);
  if (!preview) {
    return [];
  }

  const toSuggestionRecords = (decision: MemorySuggestion['decision']): MemorySuggestion[] => {
    return categorizedSuggestions.map((suggestion) => ({
      category: suggestion.category,
      decision,
      summary: suggestion.summary.replace(/\s+/gu, ' ').trim().slice(0, 220),
    }));
  };

  if (memoryConfig.autoSave) {
    await memoryManager.saveProjectMemory(candidate, true);
    eventBus.emit({
      message: 'Project memory updated automatically.',
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    return toSuggestionRecords('saved');
  }

  if (!memoryConfig.autoSuggest || !canPromptForApproval) {
    return [];
  }

  const approval = await approvalManager.request({
    details: preview,
    kind: 'write',
    message: 'Save these learnings to project memory? [y/N]',
    resource: '.apeironcode-agent/memory.md',
    riskLevel: 'medium',
    scope: 'project',
    title: 'Save project memory',
  });
  if (!approval.approved) {
    return toSuggestionRecords('skipped');
  }

  await memoryManager.saveProjectMemory(candidate, true);
  eventBus.emit({
    message: 'Project memory updated.',
    timestamp: createEventTimestamp(),
    type: 'status.updated',
  });
  return toSuggestionRecords('saved');
};

export const persistRunMemoryGraph = async ({
  cwd,
  mode,
  options,
  providerName,
  model,
  result,
  sessionId,
}: {
  cwd: string;
  mode: AgentMode;
  model: string;
  options: Pick<AgentRunOptions, 'prompt' | 'skillName'>;
  providerName: string;
  result: Awaited<ReturnType<typeof runAgentLoop>>;
  sessionId: string;
}): Promise<void> => {
  if (!runProducedUsefulEvidence(result) || TRIVIAL_PROMPT_RE.test(options.prompt.trim())) {
    return;
  }
  const graphStore = new MemoryGraphStore(cwd);
  let memoryGraph = await graphStore.load();
  const sessionEntityName = `session:${sessionId}`;
  const taskEntityName = options.prompt.slice(0, 120);
  memoryGraph = upsertMemoryFact(memoryGraph, {
    confidence: 0.8,
    metadata: {
      mode,
      provider: providerName,
      model,
      skillName: options.skillName,
    },
    name: sessionEntityName,
    observation: result.finalMessage.content.slice(0, 500),
    source: 'session',
    tags: ['session'],
    type: 'session',
  });
  memoryGraph = upsertMemoryFact(memoryGraph, {
    confidence: 0.75,
    metadata: {
      mode,
      sessionId,
      filesChanged: result.taskState?.filesChanged ?? [],
      testsRun: result.taskState?.testsRun ?? [],
    },
    name: taskEntityName,
    observation: `Task completed in mode ${mode}: ${result.finalMessage.content.slice(0, 300)}`,
    source: 'session',
    tags: ['task'],
    type: 'task',
  });
  memoryGraph = upsertMemoryEdge(memoryGraph, {
    from: createMemoryEntityId('session', sessionEntityName),
    source: 'session',
    to: createMemoryEntityId('task', taskEntityName),
    type: 'plan_generated_changes',
  });
  for (const filePath of result.taskState?.filesChanged ?? []) {
    memoryGraph = upsertMemoryFact(memoryGraph, {
      confidence: 0.75,
      metadata: {sessionId},
      name: filePath,
      observation: `Modified during session ${sessionId} for: ${options.prompt}`,
      source: 'session',
      tags: ['changed-file'],
      type: 'file',
    });
    memoryGraph = upsertMemoryEdge(memoryGraph, {
      from: createMemoryEntityId('session', sessionEntityName),
      source: 'session',
      to: createMemoryEntityId('file', filePath),
      type: 'session_modified_file',
    });
  }
  if (options.skillName) {
    memoryGraph = upsertMemoryFact(memoryGraph, {
      confidence: 0.8,
      metadata: {sessionId},
      name: options.skillName,
      observation: `Skill used for task: ${options.prompt}`,
      source: 'session',
      tags: ['skill'],
      type: 'skill',
    });
  }
  await graphStore.save(memoryGraph);
  await new MemorySuggestionStore(cwd).append({
    confidence: result.taskState?.errors.length ? 'low' : 'medium',
    proposedFacts: buildSessionMemorySuggestion({
      filesChanged: result.taskState?.filesChanged,
      finalMessage: result.finalMessage.content,
      goal: options.prompt,
      mode,
      sessionId,
      skillName: options.skillName,
    }),
    relatedFiles: result.taskState?.filesChanged,
    relatedSessionId: sessionId,
    source: options.skillName ? 'skill' : 'agent-run',
    summary: `${options.skillName ? `Skill ${options.skillName}` : 'Agent'} completed ${mode}: ${options.prompt.slice(0, 120)}`,
  });
};
