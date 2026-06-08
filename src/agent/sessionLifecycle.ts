import crypto from 'node:crypto';

import {compactSession} from '../sessions/compaction.js';
import type {ChatMessage} from './types.js';
import type {ConversationSession} from './session.js';

export const clearConversationSession = (session: ConversationSession): void => {
  session.messages = [];
  session.plan = null;
  session.sessionMemory = undefined;
  session.lastContextSnapshot = undefined;
  session.taskPlanId = undefined;
  session.taskState = undefined;
  session.toolCalls = [];
  session.updatedAt = new Date().toISOString();
};

export const loadConversationSession = (
  target: ConversationSession,
  source: ConversationSession,
): void => {
  target.id = source.id;
  target.createdAt = source.createdAt;
  target.lastGoal = source.lastGoal;
  target.messages = [...source.messages];
  target.model = source.model;
  target.mode = source.mode;
  target.modeReason = source.modeReason;
  target.plan = source.plan;
  target.projectPath = source.projectPath;
  target.provider = source.provider;
  target.taskPlanId = source.taskPlanId;
  target.taskState = source.taskState;
  target.title = source.title;
  target.transcriptPath = source.transcriptPath;
  target.sessionMemory = source.sessionMemory;
  target.lastContextSnapshot = source.lastContextSnapshot;
  target.toolCalls = [...source.toolCalls];
  target.tokenUsage = source.tokenUsage;
  target.updatedAt = source.updatedAt;
};

export const compactConversationSession = (session: ConversationSession): string => {
  const compacted = compactSession({
    messages: session.messages,
    taskState: session.taskState,
    toolCalls: session.toolCalls,
  });
  const compactedMessage: ChatMessage = {
    content: compacted.summary,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
  session.messages = [...compacted.retainedMessages, compactedMessage];
  session.updatedAt = new Date().toISOString();
  return compactedMessage.content;
};

export const mergeUsageBreakdown = (
  existing: ConversationSession['tokenUsage'],
  nextUsage: NonNullable<ConversationSession['tokenUsage']>,
): ConversationSession['tokenUsage'] => {
  type UsageBreakdownEntry = NonNullable<NonNullable<ConversationSession['tokenUsage']>['breakdown']>[number];
  const grouped = new Map<string, UsageBreakdownEntry>();

  for (const entry of [...(existing?.breakdown ?? []), ...(nextUsage.breakdown ?? [])]) {
    const key = `${entry.provider}:${entry.model}`;
    const current = grouped.get(key) ?? {
      calls: 0,
      estimatedCostUsd: 0,
      inputTokens: 0,
      model: entry.model,
      outputTokens: 0,
      provider: entry.provider,
    };
    current.calls += entry.calls;
    current.estimatedCostUsd += entry.estimatedCostUsd;
    current.inputTokens += entry.inputTokens;
    current.outputTokens += entry.outputTokens;
    grouped.set(key, current);
  }

  return {
    breakdown: Array.from(grouped.values()),
    estimatedCostUsd: (existing?.estimatedCostUsd ?? 0) + (nextUsage.estimatedCostUsd ?? 0),
    inputTokens: (existing?.inputTokens ?? 0) + (nextUsage.inputTokens ?? 0),
    outputTokens: (existing?.outputTokens ?? 0) + (nextUsage.outputTokens ?? 0),
    totalTokens: (existing?.totalTokens ?? 0) + (nextUsage.totalTokens ?? 0),
  };
};
