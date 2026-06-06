import crypto from 'node:crypto';

import type {ConversationSession} from '../../agent/session.js';
import type {ChatMessage} from '../../agent/types.js';
import {formatCost, formatTokens} from '../../providers/costTracker.js';
import type {TaskPlan} from '../../tasks/types.js';
import {estimateUsage} from '../../utils/tokens.js';

export const createLocalMessage = (role: ChatMessage['role'], content: string): ChatMessage => ({
  content,
  createdAt: new Date().toISOString(),
  id: crypto.randomUUID(),
  role,
});

export const formatUsageSummary = (input: string, output: string): string => {
  const usage = estimateUsage(input, output);
  return `${usage.totalTokens} est. tokens`;
};

export const formatRecordedUsageSummary = (usage?: ConversationSession['tokenUsage']): string | null => {
  if (!usage?.totalTokens) {
    return null;
  }

  return `${formatTokens(usage.totalTokens)} tokens${usage.estimatedCostUsd ? ` · ${formatCost(usage.estimatedCostUsd)}` : ''}`;
};

export const mapTaskStatusToTodoStatus = (
  status: TaskPlan['steps'][number]['status'],
): 'completed' | 'failed' | 'pending' | 'running' => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
};
