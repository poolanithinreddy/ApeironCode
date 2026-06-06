import {describe, expect, it} from 'vitest';

import {
  formatToolBatchSummary,
  shouldSummarizeToolBatch,
  summarizeToolBatch,
  type ToolCall,
  type ToolCallResult,
} from '../../src/agent/toolBatchSummary.js';
import {buildContextViewReport, formatContextViewReport} from '../../src/context/contextViewer.js';
import {explainContextCompaction, formatCompactionExplanation} from '../../src/context/compactionExplain.js';
import {detectTodoMarkers, evaluateCompletionGates} from '../../src/agent/completionGates.js';
import {buildCompletionGateContextFromRun} from '../../src/agent/completionGateRuntime.js';

describe('safety runtime follow-up integration', () => {
  it('multi-tool batch produces a summary', () => {
    const calls: ToolCall[] = [
      {id: '1', name: 'read_file', input: {path: 'src/a.ts'}},
      {id: '2', name: 'edit_file', input: {path: 'src/a.ts'}},
      {id: '3', name: 'test_runner', input: {command: 'npm test'}},
    ];
    const results: ToolCallResult[] = [
      {id: '1', name: 'read_file', ok: true, summary: 'ok'},
      {id: '2', name: 'edit_file', ok: true, summary: 'ok', filesChanged: ['src/a.ts']},
      {id: '3', name: 'test_runner', ok: true, summary: 'passed'},
    ];
    expect(shouldSummarizeToolBatch(calls)).toBe(true);
    const summary = summarizeToolBatch(calls, results);
    const formatted = formatToolBatchSummary(summary);
    expect(formatted).toContain('test_runner');
    expect(formatted).toContain('src/a.ts');
  });

  it('context view formatter never exposes raw secret values', () => {
    const report = buildContextViewReport({
      selectedFiles: [{path: 'src/secret-module.ts', tokens: 500, reason: 'relevant'}],
      memoryItems: [{id: 'm1', kind: 'project_fact', content: 'API_SECRET=AKIAIOSFODNN7EXAMPLEKEY1234'}],
    });
    const formatted = formatContextViewReport(report);
    expect(formatted).not.toContain('AKIAIOSFODNN7EXAMPLEKEY1234');
    expect(formatted).toContain('src/secret-module.ts');
  });

  it('context view safe no-snapshot message when no data', () => {
    const report = buildContextViewReport({});
    const formatted = formatContextViewReport(report);
    expect(formatted).toContain('Files selected: 0');
    expect(formatted).not.toContain('undefined');
    expect(formatted).not.toContain('null');
  });

  it('compaction explanation reports token savings', () => {
    const explanation = explainContextCompaction(
      {items: ['a.ts', 'b.ts', 'c.ts'], tokens: 3000},
      {items: ['a.ts', 'summary:b-c'], tokens: 1200},
      'context window limit',
    );
    const formatted = formatCompactionExplanation(explanation);
    expect(formatted).toContain('1800');
    expect(formatted).not.toContain('super_secret');
  });

  it('TODO marker triggers completion gate warning', () => {
    const ctx = buildCompletionGateContextFromRun({
      filesChanged: ['src/index.ts'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'fix the bug',
      verificationRan: false,
      buildRan: false,
      testsRan: true,
      changedTextSummary: '// TODO: remove this hack',
    });
    const result = evaluateCompletionGates(ctx);
    const todoGate = result.gates.find((g) => g.name === 'unresolved-todo');
    expect(todoGate).toBeDefined();
    expect(todoGate?.passed).toBe(false);
  });

  it('detectTodoMarkers catches code TODO/FIXME/HACK markers', () => {
    expect(detectTodoMarkers('// TODO: fix this')).toBe(true);
    expect(detectTodoMarkers('// FIXME: broken edge case')).toBe(true);
    expect(detectTodoMarkers('throw new Error("TODO: implement")')).toBe(true);
    expect(detectTodoMarkers('class Foo extends NotImplemented {}')).toBe(true);
    expect(detectTodoMarkers('my todo list for the week')).toBe(false);
    expect(detectTodoMarkers('all done, no markers here')).toBe(false);
  });
});
