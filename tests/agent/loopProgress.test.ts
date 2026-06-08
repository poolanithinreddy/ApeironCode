import {describe, expect, it} from 'vitest';

import {LoopProgressTracker} from '../../src/agent/loopProgress.js';
import type {ToolCallRecord} from '../../src/agent/types.js';

const toolCall = (overrides: Partial<ToolCallRecord>): ToolCallRecord => ({
  createdAt: new Date().toISOString(),
  id: `tool-${Math.random()}`,
  input: {},
  status: 'success',
  toolName: 'noop',
  ...overrides,
});

describe('LoopProgressTracker', () => {
  it('records files changed, read files, commands, and tools called', () => {
    const tracker = new LoopProgressTracker();
    const summary = tracker.record(1, [
      toolCall({input: {path: 'src/a.ts'}, toolName: 'read_file'}),
      toolCall({input: {path: 'src/a.ts'}, toolName: 'edit_file'}),
      toolCall({input: {command: 'npm test'}, toolName: 'run_command'}),
    ]);

    expect(summary.filesRead).toEqual(['src/a.ts']);
    expect(summary.filesChanged).toEqual(['src/a.ts']);
    expect(summary.commandsRun).toEqual(['npm test']);
    expect(summary.toolsCalled).toEqual(['read_file', 'edit_file', 'run_command']);
  });

  it('detects no-progress stalls', () => {
    const tracker = new LoopProgressTracker();
    tracker.record(1, [toolCall({status: 'error', toolName: 'grep', error: 'failed'})]);
    tracker.record(2, [toolCall({status: 'error', toolName: 'grep', error: 'failed'})]);
    tracker.record(3, [toolCall({status: 'error', toolName: 'grep', error: 'failed'})]);

    expect(tracker.isStalled(3)).toBe(true);
    expect(tracker.stalledReason()).toContain('Repeated grep');
  });

  it('does not mark new file reads or edits as stalled', () => {
    const tracker = new LoopProgressTracker();
    tracker.record(1, [toolCall({input: {path: 'src/a.ts'}, toolName: 'read_file'})]);
    tracker.record(2, [toolCall({input: {path: 'src/b.ts'}, toolName: 'read_file'})]);
    tracker.record(3, [toolCall({input: {path: 'src/c.ts'}, toolName: 'edit_file'})]);

    expect(tracker.isStalled(3)).toBe(false);
    expect(tracker.totalProgress().totalFilesRead).toBe(2);
    expect(tracker.totalProgress().totalFilesChanged).toBe(1);
  });

  it('handles repeated failed tool calls without counting them as progress', () => {
    const tracker = new LoopProgressTracker();
    const failed = toolCall({status: 'error', toolName: 'run_command', input: {command: 'npm test'}, error: 'exit 1'});

    tracker.record(1, [failed]);
    tracker.record(2, [failed]);
    tracker.record(3, [failed]);
    tracker.record(4, [failed]);

    const progress = tracker.totalProgress();
    expect(progress.totalCommandsRun).toBe(1);
    expect(progress.stalled).toBe(true);
    expect(progress.lastMeaningfulProgressIteration).toBe(1);
  });

  it('returns aggregate progress and resets cleanly', () => {
    const tracker = new LoopProgressTracker();
    tracker.record(1, [
      toolCall({input: {path: 'src/a.ts'}, toolName: 'read_file'}),
      toolCall({toolName: 'alpha', result: {ok: true, output: 'new info', summary: 'ok'}}),
    ]);

    expect(tracker.totalProgress()).toMatchObject({
      totalIterations: 1,
      totalFilesRead: 1,
      uniqueToolsCalled: ['alpha', 'read_file'],
      stalled: false,
    });

    tracker.reset();
    expect(tracker.totalProgress().totalIterations).toBe(0);
  });
});
