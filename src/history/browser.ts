import type {ConversationSession} from '../agent/session.js';
import {formatCost, formatTokens, summarizeUsageSnapshots} from '../providers/costTracker.js';
import type {EditHistoryRecord} from '../tools/patch/types.js';

const formatSessionUsage = (session: Pick<ConversationSession, 'tokenUsage'>): string => {
  if (!session.tokenUsage?.totalTokens) {
    return 'no usage';
  }

  return `${formatTokens(session.tokenUsage.totalTokens)} | ${formatCost(session.tokenUsage.estimatedCostUsd)}`;
};

export const formatSessionBrowser = (
  sessions: Array<Pick<ConversationSession, 'id' | 'model' | 'projectPath' | 'provider' | 'title' | 'tokenUsage' | 'updatedAt'>>,
  options?: {emptyLabel?: string; includeProjectPath?: boolean},
): string => {
  if (sessions.length === 0) {
    return options?.emptyLabel ?? 'No saved sessions found.';
  }

  return sessions
    .map((session) => [
      session.id,
      session.title,
      `${session.provider}/${session.model}`,
      options?.includeProjectPath ? session.projectPath : null,
      session.updatedAt,
      formatSessionUsage(session),
    ]
      .filter(Boolean)
      .join(' | '))
    .join('\n');
};

export const formatCostBrowser = (
  label: string,
  sessions: Array<Pick<ConversationSession, 'id' | 'tokenUsage'>>,
): string => {
  if (sessions.length === 0) {
    return `No sessions found for ${label}.`;
  }

  const summary = summarizeUsageSnapshots(sessions.map((session) => session.tokenUsage));
  const sessionsWithUsage = sessions.filter((session) => Boolean(session.tokenUsage?.totalTokens)).length;

  return [
    `Scope: ${label}`,
    `Sessions: ${sessions.length}`,
    `Sessions with usage: ${sessionsWithUsage}`,
    `Input tokens: ${formatTokens(summary.totalInputTokens)}`,
    `Output tokens: ${formatTokens(summary.totalOutputTokens)}`,
    `Total tokens: ${formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}`,
    `Estimated cost: ${formatCost(summary.totalEstimatedCostUsd)}`,
    `Breakdown: ${summary.breakdown.length > 0
      ? summary.breakdown.map((entry) => `${entry.provider}/${entry.model} (${entry.calls} call${entry.calls === 1 ? '' : 's'}, ${formatTokens(entry.inputTokens + entry.outputTokens)}, ${formatCost(entry.estimatedCostUsd)})`).join('; ')
      : 'none'}`,
  ].join('\n');
};

export const formatEditHistoryBrowser = (
  records: EditHistoryRecord[],
  emptyLabel = 'No edit history found.',
): string => {
  if (records.length === 0) {
    return emptyLabel;
  }

  return records
    .map((record) => [
      record.id,
      record.operationType,
      record.filePath,
      `+${record.addedLines}/-${record.removedLines}`,
      record.timestamp,
      record.sessionId ? `session:${record.sessionId}` : null,
      record.revertedEditId ? `revert:${record.revertedEditId}` : null,
    ]
      .filter(Boolean)
      .join(' | '))
    .join('\n');
};

export const formatHistoryBrowser = (options: {
  costLabel: string;
  editLabel: string;
  edits: EditHistoryRecord[];
  includeProjectPath?: boolean;
  sessionLabel: string;
  sessions: Array<Pick<ConversationSession, 'id' | 'model' | 'projectPath' | 'provider' | 'title' | 'tokenUsage' | 'updatedAt'>>;
}): string => {
  return [
    `Sessions (${options.sessionLabel}):`,
    formatSessionBrowser(options.sessions, {
      emptyLabel: `No sessions found for ${options.sessionLabel}.`,
      includeProjectPath: options.includeProjectPath,
    }),
    '',
    `Cost (${options.costLabel}):`,
    formatCostBrowser(options.costLabel, options.sessions),
    '',
    `Edit history (${options.editLabel}):`,
    formatEditHistoryBrowser(options.edits, `No edit history found for ${options.editLabel}.`),
  ].join('\n');
};