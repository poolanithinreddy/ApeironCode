/**
 * ApeironCode Bridge — Permission Request Flow.
 * Manages pending permission decisions from bridge clients.
 * Timeout defaults to deny. No secrets in permission text.
 */

import {randomUUID} from 'node:crypto';
import type {BridgeMessage} from './types.js';
import {createBridgeMessage} from './types.js';
import {redactBridgePayload} from './redaction.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export type PermissionDecision = 'approved' | 'denied' | 'timeout';

export interface BridgePermissionRequest {
  id: string;
  action: string;
  description: string;
  toolName?: string;
  filePath?: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  decision?: PermissionDecision;
  resolvedAt?: string;
}

export interface PermissionRequestOptions {
  description?: string;
  toolName?: string;
  filePath?: string;
}

type Resolver = (decision: PermissionDecision) => void;

/** In-process registry of pending permission requests. */
const pendingRequests = new Map<string, {request: BridgePermissionRequest; resolve: Resolver}>();

/**
 * Creates a bridge permission.requested message for a proposed action.
 * The returned id is used to resolve the decision later.
 */
export const createBridgePermissionRequest = (
  action: string,
  options: PermissionRequestOptions = {},
): BridgePermissionRequest => {
  const id = randomUUID();
  const request: BridgePermissionRequest = {
    id,
    action: action.slice(0, 500),
    description: (options.description ?? action).slice(0, 500),
    toolName: options.toolName,
    filePath: options.filePath,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return request;
};

/**
 * Resolves a pending permission request with a decision.
 * Returns true if the request was found, false if already resolved or unknown.
 */
export const resolveBridgePermissionRequest = (
  id: string,
  decision: PermissionDecision,
): boolean => {
  const entry = pendingRequests.get(id);
  if (!entry) return false;
  entry.request.status = 'resolved';
  entry.request.decision = decision;
  entry.request.resolvedAt = new Date().toISOString();
  entry.resolve(decision);
  pendingRequests.delete(id);
  return true;
};

export interface WaitForPermissionOptions {
  timeoutMs?: number;
}

/**
 * Registers a permission request and waits for a decision.
 * On timeout, returns 'timeout' (treated as deny).
 */
export const waitForBridgePermissionDecision = (
  request: BridgePermissionRequest,
  options: WaitForPermissionOptions = {},
): Promise<PermissionDecision> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<PermissionDecision>((resolve) => {
    pendingRequests.set(request.id, {request, resolve});

    const timer = setTimeout(() => {
      if (pendingRequests.has(request.id)) {
        pendingRequests.delete(request.id);
        request.status = 'resolved';
        request.decision = 'timeout';
        resolve('timeout');
      }
    }, timeoutMs);

    // Prevent timer from blocking Node exit in tests
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as {unref: () => void}).unref();
    }
  });
};

/** Formats a permission request for safe display (no secrets). */
export const formatBridgePermissionRequest = (request: BridgePermissionRequest): string => {
  const safe = redactBridgePayload({
    action: request.action,
    description: request.description,
    toolName: request.toolName,
    filePath: request.filePath,
  }) as Record<string, unknown>;

  const action = typeof safe['action'] === 'string' ? safe['action'] : '';
  const toolName = typeof safe['toolName'] === 'string' ? safe['toolName'] : '';
  const filePath = typeof safe['filePath'] === 'string' ? safe['filePath'] : '';
  return [
    `Permission requested: ${action}`,
    toolName ? `  Tool: ${toolName}` : '',
    filePath ? `  Path: ${filePath}` : '',
    `  ID: ${request.id.slice(0, 8)}`,
    `  Status: ${request.status}`,
  ].filter(Boolean).join('\n');
};

/** Creates the bridge message for a permission request. */
export const permissionRequestToBridgeMessage = (request: BridgePermissionRequest): BridgeMessage =>
  createBridgeMessage('permission.requested', {
    requestId: request.id,
    action: request.action.slice(0, 200),
    toolName: request.toolName,
    filePath: request.filePath ? request.filePath.slice(0, 300) : undefined,
  });
