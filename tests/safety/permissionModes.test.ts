import {describe, expect, it} from 'vitest';

import {
  describePermissionMode,
  getPermissionDecision,
  isNonInteractiveMode,
} from '../../src/safety/permissionModes.js';

describe('permissionModes', () => {
  it('default asks for write/shell, allows read', () => {
    expect(getPermissionDecision('default', 'read-file')).toBe('allow');
    expect(getPermissionDecision('default', 'write-file')).toBe('ask');
    expect(getPermissionDecision('default', 'run-shell')).toBe('ask');
  });

  it('plan denies writes and shell', () => {
    expect(getPermissionDecision('plan', 'write-file')).toBe('deny');
    expect(getPermissionDecision('plan', 'run-shell')).toBe('deny');
    expect(getPermissionDecision('plan', 'read-file')).toBe('allow');
  });

  it('accept-edits allows edits but asks for shell/network', () => {
    expect(getPermissionDecision('accept-edits', 'edit-file')).toBe('allow');
    expect(getPermissionDecision('accept-edits', 'run-network')).toBe('ask');
  });

  it('safe-auto allows safe shell, asks for risky', () => {
    expect(getPermissionDecision('safe-auto', 'run-shell', 'safe')).toBe('allow');
    expect(getPermissionDecision('safe-auto', 'run-shell', 'high')).toBe('ask');
    expect(getPermissionDecision('safe-auto', 'run-network')).toBe('ask');
    expect(getPermissionDecision('safe-auto', 'run-destructive')).toBe('deny');
  });

  it('CI denies writes and shell', () => {
    expect(getPermissionDecision('ci', 'write-file')).toBe('deny');
    expect(getPermissionDecision('ci', 'run-shell')).toBe('deny');
    expect(getPermissionDecision('ci', 'read-file')).toBe('allow');
  });

  it('yolo allows most but asks for destructive and protected paths', () => {
    expect(getPermissionDecision('yolo', 'write-file')).toBe('allow');
    expect(getPermissionDecision('yolo', 'run-destructive')).toBe('ask');
    expect(getPermissionDecision('yolo', 'edit-protected-path')).toBe('ask');
  });

  it('yolo asks for critical shell commands', () => {
    expect(getPermissionDecision('yolo', 'run-shell', 'critical')).toBe('ask');
    expect(getPermissionDecision('yolo', 'run-shell', 'low')).toBe('allow');
  });

  it('strict denies destructive and protected', () => {
    expect(getPermissionDecision('strict', 'run-destructive')).toBe('deny');
    expect(getPermissionDecision('strict', 'edit-protected-path')).toBe('deny');
  });

  it('isNonInteractiveMode for ci and plan', () => {
    expect(isNonInteractiveMode('ci')).toBe(true);
    expect(isNonInteractiveMode('plan')).toBe(true);
    expect(isNonInteractiveMode('default')).toBe(false);
  });

  it('describePermissionMode returns a non-empty string', () => {
    expect(describePermissionMode('default').length).toBeGreaterThan(0);
    expect(describePermissionMode('yolo').length).toBeGreaterThan(0);
  });
});
