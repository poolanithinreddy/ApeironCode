import {describe, expect, it} from 'vitest';

import {evaluateCompletionGates} from '../../src/agent/completionGates.js';
import {
  applyCompletionGateFeedback,
  buildCompletionGateContextFromRun,
  deriveRunStateFromToolCalls,
  evaluateRunCompletionGates,
  shouldBlockCompletion,
} from '../../src/agent/completionGateRuntime.js';
import type {ToolCallRecord} from '../../src/agent/types.js';

describe('completionGateRuntime', () => {
  it('buildCompletionGateContextFromRun fills userAskedForTests from prompt', () => {
    const ctx = buildCompletionGateContextFromRun({
      filesChanged: ['src/x.ts'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'please run the tests',
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    expect(ctx.userAskedForTests).toBe(true);
  });

  it('buildCompletionGateContextFromRun is false when prompt has no test mention', () => {
    const ctx = buildCompletionGateContextFromRun({
      filesChanged: [],
      toolsExecuted: [],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'fix the readme typo',
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    expect(ctx.userAskedForTests).toBe(false);
  });

  it('applyCompletionGateFeedback appends feedback when gates fail', () => {
    const result = evaluateCompletionGates({
      filesChanged: ['src/foo.ts'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userAskedForTests: false,
      todoMarkersIntroduced: false,
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    const out = applyCompletionGateFeedback('Done.', result);
    expect(out.length).toBeGreaterThan('Done.'.length);
    expect(out).toContain('Completion gates');
  });

  it('applyCompletionGateFeedback is a no-op when gates pass', () => {
    const result = evaluateCompletionGates({
      filesChanged: [],
      toolsExecuted: [],
      toolFailures: [],
      rollbackOccurred: false,
      userAskedForTests: false,
      todoMarkersIntroduced: false,
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    const out = applyCompletionGateFeedback('Done.', result);
    expect(out).toBe('Done.');
  });

  it('shouldBlockCompletion is true when a block-severity gate fails', () => {
    const result = evaluateCompletionGates({
      filesChanged: [],
      toolsExecuted: ['edit_file'],
      toolFailures: ['edit_file'],
      rollbackOccurred: false,
      userAskedForTests: false,
      todoMarkersIntroduced: false,
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    expect(shouldBlockCompletion(result)).toBe(true);
  });

  it('shouldBlockCompletion is false when only warn-severity gates fail', () => {
    const result = evaluateCompletionGates({
      filesChanged: ['src/x.ts'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userAskedForTests: false,
      todoMarkersIntroduced: false,
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    expect(shouldBlockCompletion(result)).toBe(false);
  });

  it('deriveRunStateFromToolCalls extracts file changes and test runs', () => {
    const calls: ToolCallRecord[] = [
      {
        id: '1',
        toolName: 'edit_file',
        input: {path: 'src/foo.ts'},
        status: 'success',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        toolName: 'test_runner',
        input: {command: 'npm test'},
        status: 'success',
        createdAt: new Date().toISOString(),
      },
    ];
    const run = deriveRunStateFromToolCalls(calls, 'fix it');
    expect(run.filesChanged).toContain('src/foo.ts');
    expect(run.testsRan).toBe(true);
    expect(run.toolsExecuted).toEqual(['edit_file', 'test_runner']);
    expect(run.toolFailures).toEqual([]);
  });

  it('evaluateRunCompletionGates wires through correctly', () => {
    const result = evaluateRunCompletionGates({
      filesChanged: ['README.md'],
      toolsExecuted: ['edit_file'],
      toolFailures: [],
      rollbackOccurred: false,
      userPrompt: 'update docs',
      verificationRan: false,
      buildRan: false,
      testsRan: false,
    });
    // Docs-only — should pass
    expect(result.passed).toBe(true);
  });
});
