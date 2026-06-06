import {beforeEach, describe, expect, it} from 'vitest';

import {evaluateCompletionGates} from '../../src/agent/completionGates.js';
import {
  applyCompletionGateFeedback,
  buildCompletionGateContextFromRun,
} from '../../src/agent/completionGateRuntime.js';
import {
  emitPostToolUseHook,
  emitPreToolUseHook,
} from '../../src/agent/hookRuntime.js';
import {
  formatToolBatchSummary,
  shouldSummarizeToolBatch,
  summarizeToolBatch,
} from '../../src/agent/toolBatchSummary.js';
import {
  buildContextViewReport,
  formatContextViewReport,
} from '../../src/context/contextViewer.js';
import {globalHookRunner} from '../../src/hooks/v2/runner.js';

describe('safety runtime integration', () => {
  beforeEach(() => {
    globalHookRunner.clear();
  });

  it('PreToolUse hook fires and can block tool execution', async () => {
    const blocked: string[] = [];
    globalHookRunner.register({
      id: 'test-blocker',
      events: ['PreToolUse'],
      handler: (evt) => {
        if (evt.toolName === 'run_command') {
          blocked.push(evt.toolName);
          return {action: 'block', message: 'command blocked by hook'};
        }
        return {action: 'continue'};
      },
    });

    const result = await emitPreToolUseHook('run_command', {command: 'rm -rf /'});
    expect(result.action).toBe('block');
    expect(blocked).toContain('run_command');
  });

  it('PostToolUse hook fires on success', async () => {
    const fired: string[] = [];
    globalHookRunner.register({
      id: 'post-logger',
      events: ['PostToolUse'],
      handler: (evt) => {
        if (evt.toolName) fired.push(evt.toolName);
        return {action: 'continue'};
      },
    });

    await emitPostToolUseHook('read_file', 'contents');
    expect(fired).toContain('read_file');
  });

  it('source edit without tests triggers completion gate warning', () => {
    const ctx = buildCompletionGateContextFromRun({
      filesChanged: ['src/index.ts'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'fix the bug',
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    const result = evaluateCompletionGates(ctx);
    const final = applyCompletionGateFeedback('Done.', result);
    expect(final.length).toBeGreaterThan('Done.'.length);
    expect(final).toContain('src-without-tests');
  });

  it('docs-only change does not trigger completion gate', () => {
    const ctx = buildCompletionGateContextFromRun({
      filesChanged: ['README.md', 'docs/guide.md'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'update the readme',
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    const result = evaluateCompletionGates(ctx);
    const final = applyCompletionGateFeedback('Done.', result);
    expect(final).toBe('Done.');
  });

  it('tool batch summary for multi-tool batch', () => {
    const calls = [
      {id: '1', name: 'read_file', input: {path: 'src/index.ts'}},
      {id: '2', name: 'edit_file', input: {path: 'src/index.ts'}},
      {id: '3', name: 'test_runner', input: {command: 'npm test'}},
    ];
    const results = [
      {id: '1', name: 'read_file', ok: true, summary: 'file read'},
      {id: '2', name: 'edit_file', ok: true, summary: 'file edited', filesChanged: ['src/index.ts']},
      {id: '3', name: 'test_runner', ok: true, summary: 'tests passed'},
    ];
    expect(shouldSummarizeToolBatch(calls)).toBe(true);
    const summary = summarizeToolBatch(calls, results);
    expect(summary.toolsRun).toHaveLength(3);
    expect(summary.filesChanged).toContain('src/index.ts');
    expect(summary.testsRun).toHaveLength(1);
    const formatted = formatToolBatchSummary(summary);
    expect(formatted).toContain('Tool batch summary');
  });

  it('context viewer report has no raw memory content (truncated)', () => {
    const report = buildContextViewReport({
      selectedFiles: [{path: 'src/index.ts', tokens: 200, reason: 'relevant'}],
      memoryItems: [{id: 'm1', kind: 'project_fact', content: 'leaked AKIAIOSFODNN7EXAMPLE blah '.repeat(20)}],
      tokenBudget: 10000,
      tokensUsed: 5000,
    });
    const formatted = formatContextViewReport(report);
    expect(formatted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(report.memoryItems[0]?.summary.length).toBeLessThanOrEqual(82);
  });
});
