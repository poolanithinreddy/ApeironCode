import crypto from 'node:crypto';

import type {EffectiveModeReason} from './effectiveMode.js';
import type {SessionMemory} from './memoryManager.js';
import type {AgentMode, AgentTaskState, ChatMessage, ToolCallRecord} from './types.js';
import type {ContextDeltaSnapshot} from '../context/contextDelta.js';

export const deriveSessionTitle = (prompt: string): string => {
  const normalized = prompt.trim().replace(/\s+/gu, ' ');
  if (!normalized) {
    return 'Untitled session';
  }

  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
};

export interface ConversationSession {
  id: string;
  projectPath: string;
  provider: string;
  model: string;
  mode: AgentMode;
  modeReason?: EffectiveModeReason;
  title: string;
  taskPlanId?: string;
  executingPlanId?: string;
  lastGoal?: string;
  /** Pending multi-turn change request awaiting concrete instructions. */
  pendingInstruction?: {task: string; createdAt: string};
  plan?: string | null;
  taskState?: AgentTaskState;
  transcriptPath?: string;
  sessionMemory?: SessionMemory;
  lastContextSnapshot?: ContextDeltaSnapshot;
  agentSessionId?: string;
  messages: ChatMessage[];
  toolCalls: ToolCallRecord[];
  createdAt: string;
  updatedAt: string;
  planningRequired?: boolean;
  planningApproved?: boolean;
  planningMode?: 'off' | 'plan-only' | 'plan-and-execute' | 'execute-approved';
  planGateReason?: string;
  tokenUsage?: {
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

export const createSession = (
  projectPath: string,
  provider: string,
  model: string,
  options?: {
    mode?: AgentMode;
    prompt?: string;
  },
): ConversationSession => {
  const now = new Date().toISOString();
  const prompt = options?.prompt?.trim();
  return {
    createdAt: now,
    id: crypto.randomUUID(),
    lastGoal: prompt || undefined,
    mode: options?.mode ?? 'chat',
    modeReason: options?.mode ? 'explicit' : 'default',
    messages: [],
    model,
    projectPath,
    provider,
    taskPlanId: undefined,
    title: prompt ? deriveSessionTitle(prompt) : 'Untitled session',
    toolCalls: [],
    updatedAt: now,
  };
};
