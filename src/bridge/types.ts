/**
 * ApeironCode IDE Bridge Protocol — typed message definitions.
 * Local-only, JSON-serializable, no functions/classes in payloads.
 */

import {randomUUID} from 'node:crypto';

// ─── Message type string constants ─────────────────────────────────────────

export const BRIDGE_MESSAGE_TYPES = [
  // Lifecycle
  'bridge.hello', 'bridge.ready', 'bridge.ping', 'bridge.pong',
  'bridge.error', 'bridge.closed',
  // Session
  'session.created', 'session.updated', 'session.message', 'session.completed',
  'session.get_state',
  // Session commands (Phase 16F.1)
  'session.start', 'session.send_prompt', 'session.stop', 'session.busy',
  // Agent
  'agent.started', 'agent.progress', 'agent.completed', 'agent.failed',
  // Tool
  'tool.started', 'tool.output', 'tool.completed', 'tool.failed', 'tool.batch_summary',
  // Permission
  'permission.requested', 'permission.approved', 'permission.denied',
  // Task
  'task.created', 'task.updated', 'task.completed', 'task.failed',
  'task.list', 'task.get',
  // Worktree
  'worktree.created', 'worktree.updated', 'worktree.removed',
  // Checkpoint / runtime
  'checkpoint.created', 'checkpoint.restored', 'runtime.state',
  'runtime.get_state', 'checkpoint.list',
  // Context
  'context.view', 'context.compaction', 'context.delta',
  // Project Brain
  'brain.plan', 'brain.init', 'brain.status', 'brain.show', 'brain.update',
  'brain.audit', 'brain.sync_preview', 'brain.sync_apply', 'brain.build_plan',
  'brain.route', 'brain.context', 'brain.previews', 'brain.preview_show',
  'brain.preview_apply', 'brain.orchestrate_app',
  'brain.runtime', 'brain.explain',
  // Diff
  'diff.preview', 'diff.apply_requested', 'diff.apply_result',
  // Provider
  'provider.list', 'provider.get_active', 'provider.set_session_model', 'provider.session_model',
  // Terminal
  'terminal.output', 'terminal.exit',
] as const;

export type BridgeMessageType = (typeof BRIDGE_MESSAGE_TYPES)[number];

// ─── Core envelope ─────────────────────────────────────────────────────────

export interface BridgeMessage {
  /** Unique message id (UUID). */
  id: string;
  /** Message type string. */
  type: BridgeMessageType;
  /** ISO timestamp. */
  timestamp: string;
  /** Optional session id for scoped messages. */
  sessionId?: string;
  /** For responses: references the original request id. */
  requestId?: string;
  /** Message payload (JSON-serializable). */
  payload: Record<string, unknown>;
}

/** A message that expects a response (request semantics). */
export interface BridgeRequest extends BridgeMessage {
  requestId: string;
}

/** A response message correlating with a BridgeRequest. */
export interface BridgeResponse extends BridgeMessage {
  requestId: string;
  ok: boolean;
}

/** Structured bridge error (never prints raw secrets). */
export interface BridgeError {
  code: string;
  message: string;
  requestId?: string;
}

// ─── Type guards ───────────────────────────────────────────────────────────

/** Checks if a value is a valid BridgeMessage. */
export const isBridgeMessage = (value: unknown): value is BridgeMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['type'] === 'string' &&
    typeof v['timestamp'] === 'string' &&
    typeof v['payload'] === 'object' &&
    v['payload'] !== null
  );
};

/** Checks if a value is a BridgeRequest (has a requestId). */
export const isBridgeRequest = (value: unknown): value is BridgeRequest =>
  isBridgeMessage(value) &&
  typeof (value as BridgeRequest).requestId === 'string';

/** Checks if a value is a BridgeResponse (has requestId + ok). */
export const isBridgeResponse = (value: unknown): value is BridgeResponse =>
  isBridgeMessage(value) &&
  typeof (value as BridgeResponse).requestId === 'string' &&
  typeof (value as BridgeResponse).ok === 'boolean';

// ─── Message factory ───────────────────────────────────────────────────────

export interface CreateBridgeMessageOptions {
  sessionId?: string;
  requestId?: string;
  id?: string;
}

/** Creates a typed bridge message with a stable timestamp and unique id. */
export const createBridgeMessage = (
  type: BridgeMessageType,
  payload: Record<string, unknown>,
  options: CreateBridgeMessageOptions = {},
): BridgeMessage => ({
  id: options.id ?? randomUUID(),
  type,
  timestamp: new Date().toISOString(),
  sessionId: options.sessionId,
  requestId: options.requestId,
  payload,
});

/** Creates a bridge error message (no secrets in message text). */
export const createBridgeErrorMessage = (
  code: string,
  message: string,
  requestId?: string,
): BridgeMessage =>
  createBridgeMessage(
    'bridge.error',
    {code, message: message.slice(0, 500)},
    {requestId},
  );

/** Creates a pong response for a ping request. */
export const createBridgePong = (pingId: string): BridgeMessage =>
  createBridgeMessage('bridge.pong', {pingId});
