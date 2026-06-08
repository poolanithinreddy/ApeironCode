import {describe, expect, it} from 'vitest';

import {
  classifyRuntimeFailure,
  formatRecoveryInstruction,
  planRecovery,
  shouldRetryToolCall,
} from '../../src/agent/recoveryPolicy.js';

describe('recoveryPolicy', () => {
  it('classifies malformed tool JSON and schema errors', () => {
    expect(classifyRuntimeFailure('Tool call format error: invalid JSON').type).toBe('malformed_tool_input');
    expect(classifyRuntimeFailure('ZodError: required path').type).toBe('schema_validation_failed');
  });

  it('plans recovery for command, test, and sandbox failures', () => {
    expect(planRecovery(classifyRuntimeFailure('Tests failed: expected 1'), {attempts: 0}).action).toBe('read_relevant_file');
    expect(planRecovery(classifyRuntimeFailure('sandbox docker failed'), {attempts: 0}).action).toBe('run_diagnostic_tool');
    expect(planRecovery(classifyRuntimeFailure('Command exited with code 1'), {
      attempts: 0,
      checkpointAvailable: true,
      riskyEdit: true,
    }).action).toBe('rollback_checkpoint');
  });

  it('classifies provider auth failures and never retries them', () => {
    const f401 = classifyRuntimeFailure('Provider returned 401: Unauthorized');
    expect(f401.type).toBe('auth_failed');
    expect(shouldRetryToolCall(f401, 0)).toBe(false);
    expect(shouldRetryToolCall(f401, 1)).toBe(false);
    expect(planRecovery(f401, {attempts: 0}).action).toBe('mark_failed');

    expect(classifyRuntimeFailure('GitHub Models authentication failed').type).toBe('auth_failed');
    expect(classifyRuntimeFailure('403 Forbidden').type).toBe('auth_failed');
  });

  it('classifies provider payload rejections (400/422) and never retries them', () => {
    const f = classifyRuntimeFailure('GitHub Models rejected the request payload (400): bad model');
    expect(f.type).toBe('provider_rejected');
    expect(shouldRetryToolCall(f, 0)).toBe(false);
    expect(planRecovery(f, {attempts: 0}).action).toBe('mark_failed');
    expect(classifyRuntimeFailure('Provider returned 422').type).toBe('provider_rejected');
  });

  it('classifies 413 payload-too-large as provider_rejected (no retry)', () => {
    const f = classifyRuntimeFailure('Provider returned 413');
    expect(f.type).toBe('provider_rejected');
    expect(shouldRetryToolCall(f, 0)).toBe(false);
    expect(classifyRuntimeFailure('GitHub Models payload too large.').type).toBe('provider_rejected');
  });

  it('bounds retries and redacts recovery instructions', () => {
    const failure = classifyRuntimeFailure('provider stream timeout token=secret');
    const recovery = planRecovery(failure, {attempts: 1});

    expect(shouldRetryToolCall(failure, 1)).toBe(true);
    expect(shouldRetryToolCall(failure, 2)).toBe(false);
    expect(formatRecoveryInstruction(recovery)).not.toContain('secret');
    expect(planRecovery(failure, {attempts: 3}).action).toBe('mark_failed');
  });
});
