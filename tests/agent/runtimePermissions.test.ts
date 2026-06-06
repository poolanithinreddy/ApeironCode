import {describe, expect, it} from 'vitest';

import {
  classifyRuntimeActionRisk,
  formatApprovalRequest,
  recordApprovalDecision,
  requiresRuntimeApproval,
} from '../../src/agent/runtimePermissions.js';

describe('runtimePermissions', () => {
  it('allows low-risk reads without approval', () => {
    const action = {kind: 'read_file' as const, path: 'src/a.ts'};

    expect(classifyRuntimeActionRisk(action)).toBe('low');
    expect(requiresRuntimeApproval(action)).toBe(false);
  });

  it('requires approval for writes, commands, and risky package paths', () => {
    expect(requiresRuntimeApproval({kind: 'edit_file', path: 'src/a.ts'})).toBe(true);
    expect(requiresRuntimeApproval({command: 'npm test', kind: 'run_command'})).toBe(true);
    expect(classifyRuntimeActionRisk({kind: 'write_file', path: 'package.json'})).toBe('high');
  });

  it('redacts approval text and recorded decisions', () => {
    const request = formatApprovalRequest({command: 'echo token=secret', kind: 'run_command', toolName: 'run_command'});
    // Bearer tokens must be 16+ chars to trigger the safety pattern
    const longToken = 'secret-token-abc-def-ghi-123456';
    const decision = recordApprovalDecision({approved: false, reason: `Bearer ${longToken}`, risk: 'high'});

    expect(request).not.toContain('secret');
    expect(decision.reason).not.toContain(longToken);
  });
});
