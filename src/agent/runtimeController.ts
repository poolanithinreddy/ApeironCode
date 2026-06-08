import {createEventTimestamp} from '../core/events/events.js';
import type {EventBus} from '../core/events/bus.js';
import {redactSecretLikeContent} from '../memory/safety.js';
import type {ToolCallRecord} from './types.js';
import {
  createRuntimeState,
  formatRuntimeState,
  snapshotRuntimeState,
  transitionRuntimeState,
  type AgentRuntimeState,
  type RuntimeFailureReason,
} from './runtimeState.js';

export interface RuntimeSummary {
  cancelled: boolean;
  checkpointIds: string[];
  finalState: string;
  iterations: number;
  recoveryAttempts: number;
  toolCalls: number;
  verificationSteps: string[];
}

export class RuntimeController {
  private state: AgentRuntimeState = createRuntimeState();
  private readonly checkpointIds: string[] = [];
  private readonly verificationSteps: string[] = [];
  private toolCallCount = 0;
  private recoveryAttempts = 0;

  constructor(private readonly eventBus?: EventBus) {}

  snapshot(): AgentRuntimeState {
    return {...this.state, warnings: [...this.state.warnings]};
  }

  startRun(): void {
    this.transition({to: 'planning'});
  }

  startPlanning(iteration?: number): void {
    this.transition({iteration, to: 'planning'});
  }

  requestApproval(message?: string): void {
    this.transition({message, to: 'awaiting_approval'});
  }

  startCheckpoint(checkpointId?: string): void {
    if (checkpointId) this.checkpointIds.push(checkpointId);
    this.transition({activeCheckpointId: checkpointId, to: 'checkpointing'});
    if (checkpointId) {
      this.eventBus?.emit({
        checkpointId,
        timestamp: createEventTimestamp(),
        type: 'runtime.checkpoint_created',
      });
    }
  }

  startToolExecution(toolName: string, iteration?: number): void {
    this.toolCallCount += 1;
    this.transition({activeTool: toolName, iteration, to: 'executing_tool'});
  }

  finishToolExecution(toolCall?: ToolCallRecord): void {
    this.transition({
      message: toolCall?.error,
      to: toolCall?.status === 'error' ? 'recovering' : 'observing',
    });
  }

  startVerification(step = 'verification'): void {
    this.verificationSteps.push(redactSecretLikeContent(step));
    this.transition({message: step, to: 'verifying'});
    this.eventBus?.emit({
      step: redactSecretLikeContent(step),
      timestamp: createEventTimestamp(),
      type: 'runtime.verification_started',
    });
  }

  completeVerification(ok: boolean, summary: string): void {
    this.eventBus?.emit({
      ok,
      summary: redactSecretLikeContent(summary),
      timestamp: createEventTimestamp(),
      type: 'runtime.verification_completed',
    });
    this.transition({failureReason: ok ? undefined : 'verification_failed', message: summary, to: ok ? 'observing' : 'recovering'});
  }

  startRecovery(reason: string): void {
    this.recoveryAttempts += 1;
    const safeReason = redactSecretLikeContent(reason);
    this.transition({message: safeReason, to: 'recovering'});
    this.eventBus?.emit({
      attempt: this.recoveryAttempts,
      reason: safeReason,
      timestamp: createEventTimestamp(),
      type: 'runtime.recovery_started',
    });
  }

  completeRecovery(ok: boolean, summary: string): void {
    this.eventBus?.emit({
      ok,
      summary: redactSecretLikeContent(summary),
      timestamp: createEventTimestamp(),
      type: 'runtime.recovery_completed',
    });
    this.transition({failureReason: ok ? undefined : 'recovery_exhausted', message: summary, to: ok ? 'planning' : 'failed'});
  }

  startRollback(checkpointId: string): void {
    this.eventBus?.emit({
      checkpointId,
      timestamp: createEventTimestamp(),
      type: 'runtime.rollback_started',
    });
  }

  completeRollback(checkpointId: string, ok: boolean, summary: string): void {
    this.eventBus?.emit({
      checkpointId,
      ok,
      summary: redactSecretLikeContent(summary),
      timestamp: createEventTimestamp(),
      type: 'runtime.rollback_completed',
    });
  }

  completeRun(): void {
    if (this.state.phase !== 'observing' && this.state.phase !== 'verifying') {
      this.transition({to: 'observing'});
    }
    this.transition({to: 'completed'});
  }

  failRun(reason: RuntimeFailureReason, message?: string): void {
    if (this.state.phase !== 'recovering' && this.state.phase !== 'verifying') {
      this.transition({message, to: 'recovering'});
    }
    this.transition({failureReason: reason, message, to: 'failed'});
  }

  cancelRun(reason = 'cancelled'): void {
    this.transition({message: reason, to: 'cancelled'});
    this.eventBus?.emit({
      reason: redactSecretLikeContent(reason),
      timestamp: createEventTimestamp(),
      type: 'runtime.cancelled',
    });
  }

  summary(): RuntimeSummary {
    return {
      cancelled: this.state.phase === 'cancelled',
      checkpointIds: [...this.checkpointIds],
      finalState: formatRuntimeState(this.state),
      iterations: this.state.currentIteration,
      recoveryAttempts: this.recoveryAttempts,
      toolCalls: this.toolCallCount,
      verificationSteps: [...this.verificationSteps],
    };
  }

  private transition(transition: Parameters<typeof transitionRuntimeState>[1]): void {
    const from = this.state.phase;
    this.state = transitionRuntimeState(this.state, transition);
    if (this.state.phase === from && this.state.warnings.at(-1)?.startsWith('Invalid runtime transition')) {
      return;
    }
    this.eventBus?.emit({
      from,
      snapshot: snapshotRuntimeState(this.state),
      timestamp: createEventTimestamp(),
      to: this.state.phase,
      type: 'runtime.state_changed',
    });
  }
}
