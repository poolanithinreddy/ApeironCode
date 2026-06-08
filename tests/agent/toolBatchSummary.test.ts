import {describe, expect, it} from 'vitest';

import {
  formatToolBatchSummary,
  shouldSummarizeToolBatch,
  summarizeToolBatch,
  type ToolCall,
  type ToolCallResult,
} from '../../src/agent/toolBatchSummary.js';

describe('toolBatchSummary', () => {
  it('summarizes read/edit/test batch with all tool names, changed files, tests run', () => {
    const calls: ToolCall[] = [
      {id: '1', name: 'read_file', input: {path: 'src/index.ts'}},
      {id: '2', name: 'edit_file', input: {path: 'src/index.ts'}},
      {id: '3', name: 'test_runner', input: {command: 'npm test'}},
    ];
    const results: ToolCallResult[] = [
      {id: '1', name: 'read_file', ok: true, summary: 'read'},
      {id: '2', name: 'edit_file', ok: true, summary: 'edited', filesChanged: ['src/index.ts']},
      {id: '3', name: 'test_runner', ok: true, summary: 'tests passed'},
    ];
    const summary = summarizeToolBatch(calls, results);
    expect(summary.toolsRun).toEqual(['read_file', 'edit_file', 'test_runner']);
    expect(summary.filesChanged).toContain('src/index.ts');
    expect(summary.testsRun).toEqual(['npm test']);
    expect(summary.failures).toHaveLength(0);
  });

  it('shouldSummarizeToolBatch returns false for single-tool batch', () => {
    const calls: ToolCall[] = [{id: '1', name: 'read_file', input: {}}];
    expect(shouldSummarizeToolBatch(calls)).toBe(false);
  });

  it('shouldSummarizeToolBatch returns true for 3-tool batch', () => {
    const calls: ToolCall[] = [
      {id: '1', name: 'read_file', input: {}},
      {id: '2', name: 'read_file', input: {}},
      {id: '3', name: 'read_file', input: {}},
    ];
    expect(shouldSummarizeToolBatch(calls)).toBe(true);
  });

  it('shouldSummarizeToolBatch returns true for tight token budget', () => {
    const calls: ToolCall[] = [{id: '1', name: 'read_file', input: {}}];
    expect(shouldSummarizeToolBatch(calls, 1000)).toBe(true);
  });

  it('failure details are included without secrets', () => {
    const calls: ToolCall[] = [{id: '1', name: 'edit_file', input: {path: 'src/x.ts'}}];
    const results: ToolCallResult[] = [
      {id: '1', name: 'edit_file', ok: false, summary: 'failed: AKIAIOSFODNN7EXAMPLE leaked'},
    ];
    const summary = summarizeToolBatch(calls, results);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.summary).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('formatToolBatchSummary limits filesRead to first 5 with overflow indicator', () => {
    const calls: ToolCall[] = Array.from({length: 8}, (_, i) => ({
      id: String(i),
      name: 'read_file',
      input: {path: `src/file${i}.ts`},
    }));
    const results: ToolCallResult[] = calls.map((c) => ({id: c.id, name: c.name, ok: true, summary: 'ok'}));
    const summary = summarizeToolBatch(calls, results);
    const formatted = formatToolBatchSummary(summary);
    expect(formatted).toContain('+3');
    expect(formatted).toContain('src/file0.ts');
  });

  it('rollback noted in summary', () => {
    const calls: ToolCall[] = [{id: '1', name: 'edit_file', input: {path: 'a'}}];
    const results: ToolCallResult[] = [{id: '1', name: 'edit_file', ok: true, summary: 'ok'}];
    const summary = summarizeToolBatch(calls, results, {rollbackOccurred: true, checkpointCreated: true});
    expect(summary.rollbackOccurred).toBe(true);
    const formatted = formatToolBatchSummary(summary);
    expect(formatted).toContain('ROLLBACK');
    expect(formatted).toContain('Checkpoint');
  });

  it('classifies command tools and test tools correctly', () => {
    const calls: ToolCall[] = [
      {id: '1', name: 'run_command', input: {command: 'ls -la'}},
      {id: '2', name: 'build_runner', input: {}},
    ];
    const summary = summarizeToolBatch(calls, []);
    expect(summary.commandsRun).toEqual(['ls -la', 'build_runner']);
  });
});
