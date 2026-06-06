/**
 * Maps ApeironCode internal AgentEvent stream to bridge messages.
 * Sanitizes payloads before bridging — no secrets, no huge payloads.
 */

import type {AgentEvent} from '../core/events/events.js';
import type {EventBus} from '../core/events/bus.js';
import type {BridgeMessage, BridgeMessageType} from './types.js';
import {createBridgeMessage} from './types.js';
import {sanitizeBridgeMessage} from './redaction.js';
import type {BridgeServer} from './server.js';

/** Returns a bridge-safe summary of a tool call record. */
const safeToolCallPayload = (toolCall: Record<string, unknown>): Record<string, unknown> => ({
  toolCallId: toolCall['id'] ?? toolCall['toolCallId'],
  toolName: toolCall['toolName'] ?? toolCall['name'],
  status: toolCall['status'],
});

/** Maps an AgentEvent to a BridgeMessage, or null if not mappable. */
export const mapAgentEventToBridgeMessage = (event: AgentEvent): BridgeMessage | null => {
  const ts = event.timestamp;

  switch (event.type) {
    case 'tool.started':
      return createBridgeMessage('tool.started', safeToolCallPayload(
        event.toolCall as unknown as Record<string, unknown>,
      ), {id: ts});

    case 'tool.completed':
      return createBridgeMessage('tool.completed', safeToolCallPayload(
        event.toolCall as unknown as Record<string, unknown>,
      ));

    case 'tool.failed':
      return createBridgeMessage('tool.failed', safeToolCallPayload(
        event.toolCall as unknown as Record<string, unknown>,
      ));

    case 'tool.output':
      return createBridgeMessage('tool.output', {
        toolCallId: event.toolCallId,
        outputKind: event.outputKind,
        messageLength: event.message.length,
        // Tail: first 200 chars of output, redacted. Not the full message.
        outputTail: event.message.slice(0, 200).replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[REDACTED]'),
      });

    case 'loop.progress':
      return createBridgeMessage('agent.progress', {
        iteration: event.iteration,
        budget: event.budget,
        remainingBudget: event.remainingBudget,
      });

    case 'runtime.state_changed' as AgentEvent['type']:
      return createBridgeMessage('runtime.state', {
        phase: (event as unknown as Record<string, unknown>)['phase'],
      });

    case 'runtime.checkpoint_created' as AgentEvent['type']:
      return createBridgeMessage('checkpoint.created', {
        checkpointId: (event as unknown as Record<string, unknown>)['checkpointId'],
      });

    case 'task.created':
      return createBridgeMessage('task.created', {
        taskId: event.taskId,
        kind: event.kind,
        title: event.title,
      });

    case 'task.started':
      return createBridgeMessage('task.updated', {taskId: event.taskId, status: 'running'});

    case 'task.completed':
      return createBridgeMessage('task.completed', {taskId: event.taskId, status: 'succeeded'});

    case 'task.failed':
      return createBridgeMessage('task.failed', {
        taskId: event.taskId,
        errorSummary: typeof event.errorSummary === 'string'
          ? event.errorSummary.slice(0, 200)
          : undefined,
      });

    case 'task.stopped':
      return createBridgeMessage('task.updated', {taskId: event.taskId, status: 'stopped'});

    case 'task.resumed':
      return createBridgeMessage('task.updated', {taskId: event.taskId, status: 'running'});

    case 'worktree.created':
      return createBridgeMessage('worktree.created', {
        worktreeId: event.worktreeId,
        branchName: event.branchName,
        taskId: event.taskId,
      });

    case 'worktree.removed':
      return createBridgeMessage('worktree.removed', {
        worktreeId: event.worktreeId,
        branchName: event.branchName,
      });

    case 'error':
      return createBridgeMessage('bridge.error', {
        code: 'AGENT_ERROR',
        message: event.message.slice(0, 200),
        scope: event.scope,
      });

    default:
      return null;
  }
};

export type BridgeEventSubscription = () => void;

/**
 * Attaches the bridge server to an EventBus.
 * Every mappable event is sanitized and broadcast to connected clients.
 * Returns an unsubscribe function.
 */
export const attachBridgeToEventBus = (
  eventBus: EventBus,
  server: BridgeServer,
): BridgeEventSubscription => {
  const unsubscribe = eventBus.subscribe(async (event: AgentEvent) => {
    const msg = mapAgentEventToBridgeMessage(event);
    if (!msg) return;
    await server.broadcast(sanitizeBridgeMessage(msg));
  });
  return unsubscribe;
};

/** Detaches bridge from event bus (alias for unsubscribe for clarity). */
export const detachBridgeFromEventBus = (subscription: BridgeEventSubscription): void => {
  subscription();
};

/** Maps a string bridge type to a displayable category name. */
export const bridgeCategoryFor = (type: BridgeMessageType): string => {
  const prefix = type.split('.')[0] ?? 'unknown';
  return prefix;
};
