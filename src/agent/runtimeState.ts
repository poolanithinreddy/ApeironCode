import crypto from 'node:crypto';

import {redactSecretLikeContent} from '../memory/safety.js';

export type RuntimePhase =
  | 'idle'
  | 'planning'
  | 'awaiting_approval'
  | 'executing_tool'
  | 'observing'
  | 'verifying'
  | 'recovering'
  | 'checkpointing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RuntimeFailureReason =
  | 'approval_denied'
  | 'cancelled'
  | 'checkpoint_failed'
  | 'diff_budget_exceeded'
  | 'recovery_exhausted'
  | 'tool_failed'
  | 'verification_failed'
  | 'unknown';

export interface AgentRuntimeState {
  activeCheckpointId?: string;
  activePlanId?: string;
  activeTool?: string;
  cancelledReason?: string;
  currentIteration: number;
  failureReason?: RuntimeFailureReason;
  id: string;
  lastTransitionAt: string;
  phase: RuntimePhase;
  warnings: string[];
}

export interface RuntimeTransition {
  activeCheckpointId?: string;
  activePlanId?: string;
  activeTool?: string;
  failureReason?: RuntimeFailureReason;
  iteration?: number;
  message?: string;
  to: RuntimePhase;
}

export interface RuntimeStateSnapshot extends AgentRuntimeState {
  formatted: string;
}

const TERMINAL = new Set<RuntimePhase>(['completed', 'failed', 'cancelled']);

const ALLOWED: Record<RuntimePhase, RuntimePhase[]> = {
  awaiting_approval: ['executing_tool', 'checkpointing', 'recovering', 'failed', 'cancelled'],
  cancelled: [],
  checkpointing: ['executing_tool', 'observing', 'recovering', 'failed', 'cancelled'],
  completed: [],
  executing_tool: ['observing', 'verifying', 'recovering', 'failed', 'cancelled'],
  failed: [],
  idle: ['planning', 'checkpointing', 'executing_tool', 'completed', 'failed', 'cancelled'],
  observing: ['planning', 'checkpointing', 'executing_tool', 'verifying', 'completed', 'recovering', 'failed', 'cancelled'],
  planning: ['awaiting_approval', 'checkpointing', 'executing_tool', 'observing', 'failed', 'cancelled'],
  recovering: ['planning', 'checkpointing', 'executing_tool', 'observing', 'failed', 'cancelled'],
  verifying: ['completed', 'recovering', 'failed', 'cancelled'],
};

export const createRuntimeState = (): AgentRuntimeState => ({
  currentIteration: 0,
  id: crypto.randomUUID(),
  lastTransitionAt: new Date().toISOString(),
  phase: 'idle',
  warnings: [],
});

export const isTerminalRuntimeState = (state: AgentRuntimeState): boolean =>
  TERMINAL.has(state.phase);

export const canTransition = (from: RuntimePhase, to: RuntimePhase): boolean =>
  ALLOWED[from].includes(to);

export const formatRuntimeState = (state: AgentRuntimeState): string => {
  const parts = [
    `runtime=${state.phase}`,
    `iteration=${state.currentIteration}`,
    state.activeTool ? `tool=${state.activeTool}` : '',
    state.activePlanId ? `plan=${state.activePlanId}` : '',
    state.activeCheckpointId ? `checkpoint=${state.activeCheckpointId}` : '',
    state.failureReason ? `failure=${state.failureReason}` : '',
    state.cancelledReason ? `cancelled=${state.cancelledReason}` : '',
  ].filter(Boolean);
  return redactSecretLikeContent(parts.join(' '));
};

export const snapshotRuntimeState = (state: AgentRuntimeState): RuntimeStateSnapshot => ({
  ...state,
  formatted: formatRuntimeState(state),
  warnings: [...state.warnings],
});

export const transitionRuntimeState = (
  state: AgentRuntimeState,
  transition: RuntimeTransition,
): AgentRuntimeState => {
  const nextWarnings = [...state.warnings];
  if (!canTransition(state.phase, transition.to)) {
    nextWarnings.push(`Invalid runtime transition ${state.phase} -> ${transition.to}`);
    return {...state, warnings: nextWarnings};
  }

  const next: AgentRuntimeState = {
    ...state,
    currentIteration: transition.iteration ?? state.currentIteration,
    lastTransitionAt: new Date().toISOString(),
    phase: transition.to,
    warnings: transition.message
      ? [...nextWarnings, redactSecretLikeContent(transition.message)]
      : nextWarnings,
  };

  next.activeTool = transition.activeTool ?? (transition.to === 'executing_tool' ? state.activeTool : undefined);
  next.activePlanId = transition.activePlanId ?? state.activePlanId;
  next.activeCheckpointId = transition.activeCheckpointId ?? state.activeCheckpointId;
  next.failureReason = transition.failureReason ?? (transition.to === 'failed' ? 'unknown' : state.failureReason);
  next.cancelledReason = transition.to === 'cancelled'
    ? redactSecretLikeContent(transition.message ?? 'cancelled')
    : state.cancelledReason;
  return next;
};
