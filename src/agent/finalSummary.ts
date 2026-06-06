import {formatCost, formatTokens} from '../providers/costTracker.js';
import type {TaskPlan} from '../tasks/types.js';
import type {AgentMode, AgentTaskState, ToolCallRecord} from './types.js';

interface MemorySummaryEntry {
  category: string;
  decision: 'saved' | 'skipped';
  summary: string;
}

interface FinalSummaryOptions {
  baseSummary: string;
  codeIntelligenceSummary?: string;
  contextSelectionSummary?: string;
  fallbackSummary?: string;
  goal: string;
  memorySuggestions: MemorySummaryEntry[];
  memoryGraphSummary?: string;
  mode: AgentMode;
  modeLabel?: string;
  taskPlan?: TaskPlan | null;
  taskState?: AgentTaskState;
  toolCalls: ToolCallRecord[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    breakdown?: Array<{
      provider: string;
      model: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    }>;
  };
}

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const listOrNone = (items: string[]): string => {
  return items.length > 0 ? items.join(', ') : 'none';
};

const collectEditIds = (toolCalls: ToolCallRecord[]): string[] => {
  return unique(
    toolCalls
      .map((toolCall) => toolCall.result?.metadata?.editId)
      .filter((value): value is string => typeof value === 'string'),
  );
};

const collectPermissionDecisions = (toolCalls: ToolCallRecord[], taskPlan?: TaskPlan | null): string[] => {
  const toolDecisions = toolCalls
    .filter((toolCall) => toolCall.permissionDecision)
    .map((toolCall) => `${toolCall.toolName}:${toolCall.permissionDecision}`);
  return unique([...(taskPlan?.permissionDecisions ?? []), ...toolDecisions]);
};

const buildRemainingRisks = (
  toolCalls: ToolCallRecord[],
  filesChanged: string[],
  testsRun: string[],
): string[] => {
  const risks: string[] = [];

  if (toolCalls.some((toolCall) => toolCall.status === 'error')) {
    risks.push('One or more tool calls failed during the run.');
  }
  if (filesChanged.length > 0 && testsRun.length === 0) {
    risks.push('Files changed without any recorded test run.');
  }
  if (filesChanged.length === 0) {
    risks.push('No file changes were recorded.');
  }

  return risks;
};

const buildNextStep = (remainingRisks: string[], filesChanged: string[], testsRun: string[]): string => {
  if (remainingRisks.some((risk) => risk.includes('failed'))) {
    return 'Address the failed tool step and rerun the narrowest validation that covers the touched slice.';
  }
  if (filesChanged.length > 0 && testsRun.length === 0) {
    return 'Run the narrowest relevant validation for the changed files before making more edits.';
  }
  if (filesChanged.length > 0) {
    return 'Review the final diff and decide whether to commit or continue iterating.';
  }
  return 'Confirm whether a narrower or better-scoped next step is needed.';
};

const formatCostBreakdown = (usage: FinalSummaryOptions['usage']): string => {
  if (!usage?.breakdown || usage.breakdown.length === 0) {
    return 'none';
  }

  return usage.breakdown
    .map((entry) => `${entry.provider}/${entry.model} (${entry.calls} call${entry.calls === 1 ? '' : 's'}, ${formatTokens(entry.inputTokens + entry.outputTokens)}, ${formatCost(entry.estimatedCostUsd)})`)
    .join('; ');
};

/** Debug/verbose output is enabled by --verbose or APEIRONCODE_DEBUG=1. */
export const isVerboseOutputEnabled = (verbose?: boolean): boolean =>
  verbose === true || /^(1|true|yes)$/iu.test(process.env.APEIRONCODE_DEBUG ?? '');

/**
 * Concise normal-mode summary: the assistant message plus a compact
 * files/commands/tests footer. No token/memory/context/giant blocks.
 */
export const buildConciseFinalSummary = ({
  baseSummary,
  taskPlan,
  taskState,
}: Pick<FinalSummaryOptions, 'baseSummary' | 'taskPlan' | 'taskState'>): string => {
  const filesChanged = unique(taskPlan?.filesChanged ?? taskState?.filesChanged ?? []);
  const commandsRun = unique(taskPlan?.commandsRun ?? taskState?.commandsRun ?? []);
  const testsRun = unique(taskPlan?.testsRun ?? taskState?.testsRun ?? []);
  const base = baseSummary.trim();
  // Avoid duplicating footer lines the base summary already renders (e.g. the
  // file-plan execution summary already lists "Files changed: ...").
  const footer: string[] = [];
  if (filesChanged.length > 0 && !base.includes('Files changed:')) {
    footer.push(`Files changed: ${filesChanged.join(', ')}`);
  }
  if (commandsRun.length > 0 && !base.includes('Commands run:')) {
    footer.push(`Commands run: ${commandsRun.join(', ')}`);
  }
  if (testsRun.length > 0 && !base.includes('Tests run:')) {
    footer.push(`Tests run: ${testsRun.join(', ')}`);
  }
  return footer.length > 0 ? `${base}\n\n${footer.join('\n')}` : base;
};

export const shouldAppendStandardizedSummary = ({
  mode,
  taskPlan,
  toolCalls,
}: {
  mode: AgentMode;
  taskPlan?: TaskPlan | null;
  toolCalls: ToolCallRecord[];
}): boolean => {
  if (mode === 'commit') {
    return false;
  }

  return toolCalls.length > 0 || Boolean(taskPlan) || mode !== 'chat';
};

export const buildStandardizedFinalSummary = ({
  baseSummary,
  codeIntelligenceSummary,
  contextSelectionSummary,
  fallbackSummary,
  goal,
  memorySuggestions,
  memoryGraphSummary,
  mode,
  modeLabel,
  taskPlan,
  taskState,
  toolCalls,
  usage,
}: FinalSummaryOptions): string => {
  const filesInspected = unique(taskPlan?.filesInspected ?? taskState?.filesRead ?? []);
  const filesChanged = unique(taskPlan?.filesChanged ?? taskState?.filesChanged ?? []);
  const commandsRun = unique(taskPlan?.commandsRun ?? taskState?.commandsRun ?? []);
  const testsRun = unique(taskPlan?.testsRun ?? taskState?.testsRun ?? []);
  const editIds = collectEditIds(toolCalls);
  const permissionDecisions = collectPermissionDecisions(toolCalls, taskPlan);
  const remainingRisks = buildRemainingRisks(toolCalls, filesChanged, testsRun);
  const memoryLines = memorySuggestions.map((entry) => `${entry.decision}:${entry.category}: ${entry.summary}`);

  return [
    baseSummary.trim(),
    '',
    'Execution summary:',
    `- Goal: ${goal}`,
    `- Mode: ${modeLabel ?? mode}`,
    codeIntelligenceSummary ?? 'Code Intelligence: unknown',
    contextSelectionSummary ?? 'Context selection: unavailable',
    memoryGraphSummary ?? 'Memory graph facts used: unavailable',
    fallbackSummary ?? 'Provider fallback: none recorded',
    `- Files inspected: ${listOrNone(filesInspected)}`,
    `- Files changed: ${listOrNone(filesChanged)}`,
    `- Commands run: ${listOrNone(commandsRun)}`,
    `- Tests run: ${listOrNone(testsRun)}`,
    `- Patch/edit IDs: ${listOrNone(editIds)}`,
    `- Memory suggestions: ${memoryLines.length > 0 ? memoryLines.join('; ') : 'none'}`,
    `- Permission decisions: ${listOrNone(permissionDecisions)}`,
    `- Cost/tokens: ${usage?.totalTokens ? `${formatTokens(usage.totalTokens)} total, in=${formatTokens(usage.inputTokens ?? 0)}, out=${formatTokens(usage.outputTokens ?? 0)}, cost=${formatCost(usage.estimatedCostUsd)}` : 'unknown'}`,
    `- Cost breakdown: ${formatCostBreakdown(usage)}`,
    `- Remaining risks: ${remainingRisks.length > 0 ? remainingRisks.join(' ') : 'none noted from recorded tool activity'}`,
    `- Next recommended step: ${buildNextStep(remainingRisks, filesChanged, testsRun)}`,
  ].join('\n');
};
