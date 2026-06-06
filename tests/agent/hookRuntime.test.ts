import {beforeEach, describe, expect, it} from 'vitest';

import {
  emitPostToolUseFailureHook,
  emitPostToolUseHook,
  emitPreToolUseHook,
  emitStopHook,
  emitUserPromptSubmitHook,
  isBlockingHookResult,
} from '../../src/agent/hookRuntime.js';
import {globalHookRunner} from '../../src/hooks/v2/runner.js';

describe('hookRuntime', () => {
  beforeEach(() => {
    globalHookRunner.clear();
  });

  it('emitPreToolUseHook returns continue by default', async () => {
    const result = await emitPreToolUseHook('read_file', {path: 'src/foo.ts'});
    expect(result.action).toBe('continue');
  });

  it('emitPostToolUseHook returns continue by default', async () => {
    const result = await emitPostToolUseHook('read_file', 'file contents');
    expect(result.action).toBe('continue');
  });

  it('emitPostToolUseFailureHook returns continue by default', async () => {
    const result = await emitPostToolUseFailureHook('edit_file', 'file not found');
    expect(result.action).toBe('continue');
  });

  it('emitStopHook returns continue by default', async () => {
    const result = await emitStopHook('/tmp/project');
    expect(result.action).toBe('continue');
  });

  it('emitUserPromptSubmitHook returns continue by default', async () => {
    const result = await emitUserPromptSubmitHook('hello');
    expect(result.action).toBe('continue');
  });

  it('PreToolUse hook can block with action=block', async () => {
    globalHookRunner.register({
      id: 'blocker',
      events: ['PreToolUse'],
      handler: () => ({action: 'block', message: 'nope'}),
    });
    const result = await emitPreToolUseHook('run_command', {command: 'rm -rf /'});
    expect(result.action).toBe('block');
    expect(isBlockingHookResult(result)).toBe(true);
  });

  it('PreToolUse hook can deny with action=deny', async () => {
    globalHookRunner.register({
      id: 'denier',
      events: ['PreToolUse'],
      handler: () => ({action: 'deny', message: 'denied'}),
    });
    const result = await emitPreToolUseHook('write_file', {path: '/etc/hosts'});
    expect(isBlockingHookResult(result)).toBe(true);
  });

  it('isBlockingHookResult is false for continue', () => {
    expect(isBlockingHookResult({action: 'continue'})).toBe(false);
    expect(isBlockingHookResult({action: 'warn'})).toBe(false);
  });

  it('PostToolUse handlers receive the result', async () => {
    const seen: unknown[] = [];
    globalHookRunner.register({
      id: 'observer',
      events: ['PostToolUse'],
      handler: (evt) => {
        seen.push(evt.result);
        return {action: 'continue'};
      },
    });
    await emitPostToolUseHook('read_file', 'contents-here');
    expect(seen).toContain('contents-here');
  });
});
