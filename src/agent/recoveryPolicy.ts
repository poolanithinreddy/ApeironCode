import {redactSecretLikeContent} from '../memory/safety.js';
import type {ToolResult} from '../tools/types.js';

export type RuntimeFailureType =
  | 'malformed_tool_input'
  | 'schema_validation_failed'
  | 'tool_not_found'
  | 'permission_denied'
  | 'sandbox_failure'
  | 'command_failed'
  | 'test_failed'
  | 'timeout'
  | 'provider_stream_error'
  | 'auth_failed'
  | 'provider_rejected'
  | 'context_missing'
  | 'memory_conflict'
  | 'unknown';

export type RuntimeRecoveryAction =
  | 'retry_with_repaired_input'
  | 'ask_for_approval'
  | 'run_diagnostic_tool'
  | 'read_relevant_file'
  | 'reduce_scope'
  | 'rollback_checkpoint'
  | 'mark_failed'
  | 'request_user_clarification';

export interface RuntimeFailure {
  message: string;
  toolName?: string;
  type: RuntimeFailureType;
}

export interface RecoveryContext {
  attempts: number;
  checkpointAvailable?: boolean;
  riskyEdit?: boolean;
}

export interface RecoveryPlan {
  action: RuntimeRecoveryAction;
  instruction: string;
  maxAttempts: number;
}

const stringifyFailureInput = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return 'unknown failure';
  }
};

export const classifyRuntimeFailure = (
  errorOrOutput: unknown,
  toolResult?: ToolResult,
): RuntimeFailure => {
  const raw = [
    stringifyFailureInput(errorOrOutput),
    toolResult?.summary,
    toolResult?.output,
  ].filter(Boolean).join('\n');
  const text = raw.toLowerCase();
  const message = redactSecretLikeContent(raw).slice(0, 500);

  if (/tool call format|invalid json|malformed/u.test(text)) return {message, type: 'malformed_tool_input'};
  if (/zod|schema|invalid input|required/u.test(text)) return {message, type: 'schema_validation_failed'};
  if (/unknown tool|tool_not_found/u.test(text)) return {message, type: 'tool_not_found'};
  if (/\b401\b|\b403\b|unauthorized|forbidden|authentication failed|invalid api key|invalid token|expired token|missing models: read|provider_auth_error/u.test(text)) return {message, type: 'auth_failed'};
  if (/\b400\b|\b422\b|\b413\b|rejected the request payload|payload too large|provider_bad_request|provider_payload_too_large|invalid request|unsupported parameter|unknown field/u.test(text)) return {message, type: 'provider_rejected'};
  if (/permission denied|approval_denied|not approved|blocked by permission/u.test(text)) return {message, type: 'permission_denied'};
  if (/sandbox|docker|podman|firejail/u.test(text)) return {message, type: 'sandbox_failure'};
  if (/timed out|timeout/u.test(text)) return {message, type: 'timeout'};
  if (/tests? failed|fail\b|assertion|expected|received/u.test(text)) return {message, type: 'test_failed'};
  if (/command exited with code [1-9]|exit code [1-9]/u.test(text)) return {message, type: 'command_failed'};
  if (/provider|stream|rate limit|quota/u.test(text)) return {message, type: 'provider_stream_error'};
  if (/context missing|file not found|enoent/u.test(text)) return {message, type: 'context_missing'};
  if (/memory conflict|conflicting memory/u.test(text)) return {message, type: 'memory_conflict'};
  return {message, type: 'unknown'};
};

export const shouldRetryToolCall = (failure: RuntimeFailure, attempts: number): boolean => {
  const max = failure.type === 'provider_stream_error' || failure.type === 'timeout' ? 2 : 1;
  if (
    failure.type === 'permission_denied' ||
    failure.type === 'tool_not_found' ||
    failure.type === 'auth_failed' ||
    failure.type === 'provider_rejected'
  ) return false;
  return attempts < max;
};

export const planRecovery = (
  failure: RuntimeFailure,
  context: RecoveryContext,
): RecoveryPlan => {
  if (context.attempts >= 3) {
    return {action: 'mark_failed', instruction: 'Stop after bounded recovery attempts.', maxAttempts: 3};
  }
  if (context.riskyEdit && context.checkpointAvailable && (failure.type === 'test_failed' || failure.type === 'command_failed')) {
    return {action: 'rollback_checkpoint', instruction: 'Rollback risky edits to the latest checkpoint before continuing.', maxAttempts: 1};
  }
  switch (failure.type) {
    case 'malformed_tool_input':
    case 'schema_validation_failed':
      return {action: 'retry_with_repaired_input', instruction: 'Repair the tool JSON/input schema and retry once.', maxAttempts: 1};
    case 'auth_failed':
      return {action: 'mark_failed', instruction: 'Provider authentication failed. Stop immediately and show the fix steps; do not retry.', maxAttempts: 1};
    case 'provider_rejected':
      return {action: 'mark_failed', instruction: 'Provider rejected the request payload. Stop and show the safe reason; do not retry.', maxAttempts: 1};
    case 'permission_denied':
      return {action: 'ask_for_approval', instruction: 'Ask for explicit approval or choose a safer read-only path.', maxAttempts: 1};
    case 'sandbox_failure':
      return {action: 'run_diagnostic_tool', instruction: 'Run sandbox diagnostics or reduce command scope.', maxAttempts: 2};
    case 'test_failed':
      return {action: 'read_relevant_file', instruction: 'Read the failing test and implementation before editing again.', maxAttempts: 2};
    case 'timeout':
    case 'provider_stream_error':
      return {action: 'reduce_scope', instruction: 'Retry with a smaller scope and shorter output.', maxAttempts: 2};
    case 'context_missing':
      return {action: 'read_relevant_file', instruction: 'Load the missing file or refresh project context.', maxAttempts: 1};
    case 'memory_conflict':
      return {action: 'request_user_clarification', instruction: 'Ask for clarification before trusting conflicting memory.', maxAttempts: 1};
    default:
      return {action: 'mark_failed', instruction: 'Stop and summarize the failure clearly.', maxAttempts: 1};
  }
};

export const formatRecoveryInstruction = (recovery: RecoveryPlan): string =>
  redactSecretLikeContent(`${recovery.action}: ${recovery.instruction}`);
