import {describe, expect, it} from 'vitest';

import {fileExists, toolWasCalled} from '../../src/evals/assertions.js';
import {createToolCallRecord} from '../../src/evals/harness.js';
import {runEvalCase, runSuite} from '../../src/evals/runner.js';
import type {EvalAgentAdapter, EvalCase} from '../../src/evals/types.js';
import {createEvalWorkspace} from '../../src/evals/workspace.js';

const baseCase = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  assertions: [],
  description: 'test case',
  id: 'case',
  mode: 'chat',
  prompt: 'do it',
  ...overrides,
});

describe('eval runner', () => {
  it('runs passing evals and captures tools and changed files', async () => {
    const agent: EvalAgentAdapter = {
      async runEval(_evalCase, workspace) {
        await workspace.writeFile('done.txt', 'ok\n');
        return {iterations: 2, toolCalls: [createToolCallRecord('write_file')]};
      },
    };
    const result = await runEvalCase(baseCase({
      assertions: [fileExists('done.txt'), toolWasCalled('write_file')],
      setup: () => createEvalWorkspace(),
    }), agent);

    expect(result.passed).toBe(true);
    expect(result.filesChanged).toContain('done.txt');
    expect(result.iterations).toBe(2);
  });

  it('returns readable failures for assertions, setup failures, cleanup failures, and timeouts', async () => {
    const noop: EvalAgentAdapter = {runEval: () => Promise.resolve({})};
    expect((await runEvalCase(baseCase({assertions: [fileExists('missing.txt')]}), noop)).failures[0]).toContain('missing.txt');

    const setupFailure = await runEvalCase(baseCase({setup: () => Promise.reject(new Error('setup broke'))}), noop);
    expect(setupFailure.passed).toBe(false);
    expect(setupFailure.failures[0]).toContain('setup broke');

    const cleanupFailure = await runEvalCase(baseCase({
      setup: async () => {
        const workspace = await createEvalWorkspace();
        return {
          ...workspace,
          cleanup: () => Promise.reject(new Error('cleanup broke')),
        };
      },
    }), noop);
    expect(cleanupFailure.failures.join('\n')).toContain('cleanup broke');

    const slow: EvalAgentAdapter = {
      runEval: async () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
    };
    const timedOut = await runEvalCase(baseCase({timeoutMs: 1}), slow);
    expect(timedOut.failures.join('\n')).toContain('Timed out');
  });

  it('runs suites and summarizes results', async () => {
    const summary = await runSuite({
      cases: [baseCase({assertions: []}), baseCase({assertions: [fileExists('missing.txt')]})],
      description: 'suite',
      id: 'suite',
    }, {runEval: () => Promise.resolve({toolCalls: []})});

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
  });
});
