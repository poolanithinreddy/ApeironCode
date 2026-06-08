import {describe, expect, it, vi} from 'vitest';

import {HookRunner} from '../../../src/hooks/v2/runner.js';
import type {HookEvent, HookResult} from '../../../src/hooks/v2/types.js';

const makeEvent = (type: HookEvent['type'] = 'PreToolUse'): HookEvent => ({
  type,
  timestamp: Date.now(),
  toolName: 'test_tool',
});

describe('HookRunner', () => {
  it('returns continue when no hooks registered', async () => {
    const runner = new HookRunner();
    const result = await runner.run(makeEvent());
    expect(result.action).toBe('continue');
  });

  it('runs a single hook and returns its result', async () => {
    const runner = new HookRunner();
    const handler = vi.fn((): HookResult => ({action: 'continue'}));
    runner.register({id: 'h1', events: ['PreToolUse'], handler});
    await runner.run(makeEvent('PreToolUse'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('block stops execution and returns block', async () => {
    const runner = new HookRunner();
    const h1 = vi.fn((): HookResult => ({action: 'block', message: 'blocked'}));
    const h2 = vi.fn((): HookResult => ({action: 'continue'}));
    runner.register({id: 'h1', events: ['PreToolUse'], handler: h1, priority: 1});
    runner.register({id: 'h2', events: ['PreToolUse'], handler: h2, priority: 2});
    const result = await runner.run(makeEvent('PreToolUse'));
    expect(result.action).toBe('block');
    expect(h2).not.toHaveBeenCalled();
  });

  it('deny stops execution and returns deny', async () => {
    const runner = new HookRunner();
    runner.register({
      id: 'h1',
      events: ['PermissionRequest'],
      handler: (): HookResult => ({action: 'deny', message: 'not allowed'}),
    });
    const result = await runner.run(makeEvent('PermissionRequest'));
    expect(result.action).toBe('deny');
  });

  it('warn collects message and continues', async () => {
    const runner = new HookRunner();
    runner.register({
      id: 'h1',
      events: ['PreToolUse'],
      handler: (): HookResult => ({action: 'warn', message: 'be careful'}),
    });
    runner.register({
      id: 'h2',
      events: ['PreToolUse'],
      handler: (): HookResult => ({action: 'continue'}),
    });
    const result = await runner.run(makeEvent('PreToolUse'));
    expect(result.action).toBe('warn');
    expect(result.message).toContain('be careful');
  });

  it('modifyInput updates event input for subsequent hooks', async () => {
    const runner = new HookRunner();
    const capturedInput: Record<string, unknown>[] = [];
    runner.register({
      id: 'h1',
      events: ['PreToolUse'],
      priority: 1,
      handler: (): HookResult => ({action: 'modifyInput', modifiedInput: {path: 'modified.ts'}}),
    });
    runner.register({
      id: 'h2',
      events: ['PreToolUse'],
      priority: 2,
      handler: (evt): HookResult => {
        capturedInput.push(evt.input ?? {});
        return {action: 'continue'};
      },
    });
    await runner.run({...makeEvent('PreToolUse'), input: {path: 'original.ts'}});
    expect(capturedInput[0]).toEqual({path: 'modified.ts'});
  });

  it('hooks run in priority order', async () => {
    const runner = new HookRunner();
    const order: number[] = [];
    runner.register({
      id: 'h3',
      events: ['PreToolUse'],
      priority: 3,
      handler: (): HookResult => {
        order.push(3);
        return {action: 'continue'};
      },
    });
    runner.register({
      id: 'h1',
      events: ['PreToolUse'],
      priority: 1,
      handler: (): HookResult => {
        order.push(1);
        return {action: 'continue'};
      },
    });
    runner.register({
      id: 'h2',
      events: ['PreToolUse'],
      priority: 2,
      handler: (): HookResult => {
        order.push(2);
        return {action: 'continue'};
      },
    });
    await runner.run(makeEvent('PreToolUse'));
    expect(order).toEqual([1, 2, 3]);
  });

  it('hooks only run for matching event types', async () => {
    const runner = new HookRunner();
    const handler = vi.fn((): HookResult => ({action: 'continue'}));
    runner.register({id: 'h1', events: ['PostToolUse'], handler});
    await runner.run(makeEvent('PreToolUse'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('unregister removes a hook', async () => {
    const runner = new HookRunner();
    const handler = vi.fn((): HookResult => ({action: 'continue'}));
    runner.register({id: 'h1', events: ['PreToolUse'], handler});
    runner.unregister('h1');
    await runner.run(makeEvent('PreToolUse'));
    expect(handler).not.toHaveBeenCalled();
    expect(runner.count()).toBe(0);
  });
});
