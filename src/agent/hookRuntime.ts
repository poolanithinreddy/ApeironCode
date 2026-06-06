import {globalHookRunner} from '../hooks/v2/runner.js';
import type {HookEvent, HookResult} from '../hooks/v2/types.js';

/**
 * Hook v2 runtime producers. These are the canonical entry points the
 * ApeironCode runtime uses to emit lifecycle events into the global hook
 * runner. Tests may swap the runner implementation by clearing it first.
 */

export const emitPreToolUseHook = async (
  toolName: string,
  input: Record<string, unknown>,
  cwd?: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'PreToolUse', timestamp: Date.now(), toolName, input, cwd};
  return globalHookRunner.run(event);
};

export const emitPostToolUseHook = async (
  toolName: string,
  result: unknown,
  cwd?: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'PostToolUse', timestamp: Date.now(), toolName, result, cwd};
  return globalHookRunner.run(event);
};

export const emitPostToolUseFailureHook = async (
  toolName: string,
  error: string,
  cwd?: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'PostToolUseFailure', timestamp: Date.now(), toolName, error, cwd};
  return globalHookRunner.run(event);
};

export const emitPermissionRequestHook = async (
  toolName: string,
  permissionAction: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'PermissionRequest', timestamp: Date.now(), toolName, permissionAction};
  return globalHookRunner.run(event);
};

export const emitPermissionDeniedHook = async (
  toolName: string,
  permissionAction: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'PermissionDenied', timestamp: Date.now(), toolName, permissionAction};
  return globalHookRunner.run(event);
};

export const emitStopHook = async (cwd?: string): Promise<HookResult> => {
  const event: HookEvent = {type: 'Stop', timestamp: Date.now(), cwd};
  return globalHookRunner.run(event);
};

export const emitUserPromptSubmitHook = async (
  prompt: string,
  cwd?: string,
): Promise<HookResult> => {
  const event: HookEvent = {type: 'UserPromptSubmit', timestamp: Date.now(), cwd, input: {prompt}};
  return globalHookRunner.run(event);
};

export const isBlockingHookResult = (result: HookResult): boolean => {
  return result.action === 'block' || result.action === 'deny';
};
