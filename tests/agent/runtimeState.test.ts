import {describe, expect, it} from 'vitest';

import {
  canTransition,
  createRuntimeState,
  formatRuntimeState,
  isTerminalRuntimeState,
  transitionRuntimeState,
} from '../../src/agent/runtimeState.js';

describe('runtimeState', () => {
  it('allows valid transitions and formats a safe snapshot', () => {
    let state = createRuntimeState();
    state = transitionRuntimeState(state, {to: 'planning', iteration: 1});
    state = transitionRuntimeState(state, {activeTool: 'edit_file', to: 'executing_tool'});

    expect(state.phase).toBe('executing_tool');
    expect(formatRuntimeState(state)).toContain('tool=edit_file');
  });

  it('rejects invalid transitions with a warning', () => {
    const state = transitionRuntimeState(createRuntimeState(), {to: 'completed'});
    const invalid = transitionRuntimeState(state, {to: 'executing_tool'});

    expect(invalid.phase).toBe('completed');
    expect(invalid.warnings.at(-1)).toContain('Invalid runtime transition');
  });

  it('detects terminal, failure, and cancellation states', () => {
    const failed = transitionRuntimeState(
      transitionRuntimeState(createRuntimeState(), {to: 'planning'}),
      {failureReason: 'tool_failed', to: 'failed'},
    );
    const cancelled = transitionRuntimeState(createRuntimeState(), {message: 'stop sk-secret123', to: 'cancelled'});

    expect(canTransition('planning', 'failed')).toBe(true);
    expect(isTerminalRuntimeState(failed)).toBe(true);
    expect(failed.failureReason).toBe('tool_failed');
    expect(cancelled.cancelledReason).not.toContain('sk-secret123');
  });
});
