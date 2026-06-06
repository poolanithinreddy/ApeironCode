import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it, vi} from 'vitest';

import {buildProgram} from '../../src/cli/commands.js';
import {fileExists} from '../../src/evals/assertions.js';
import {runEvalCase, runSuiteById} from '../../src/evals/runner.js';
import {getEvalSuiteIds} from '../../src/evals/suites/index.js';
import {loadLastEvalResult, saveEvalResult} from '../../src/evals/results.js';
import {createDeterministicEvalAgent} from '../../src/evals/harness.js';

describe('eval framework acceptance E2E', () => {
  it('lists all built-in suites including tokenEfficiency', () => {
    expect(getEvalSuiteIds()).toEqual(expect.arrayContaining(['smoke', 'coding', 'safety', 'tools', 'token-efficiency']));
  });

  it('runs the smoke suite with the deterministic mock provider', async () => {
    const summary = await runSuiteById('smoke');

    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.total);
    expect(summary.tokenEfficiency.totalEstimatedTokens).toBeGreaterThan(0);
  });

  it('reports human-readable failures for failing eval cases', async () => {
    const result = await runEvalCase({
      assertions: [fileExists('missing.txt')],
      description: 'fails on missing file',
      id: 'missing-file-case',
      mode: 'fix',
      prompt: 'Do nothing',
    }, createDeterministicEvalAgent());

    expect(result.passed).toBe(false);
    expect(result.failures.join('\n')).toContain('Expected file to exist');
  });

  it('saves and loads eval results with token efficiency metrics', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-eval-results-'));
    try {
      const summary = await runSuiteById('smoke');
      await saveEvalResult(summary, outputDir);
      const loaded = await loadLastEvalResult('smoke', outputDir);

      expect(loaded?.suiteId).toBe('smoke');
      expect(loaded?.tokenEfficiency.totalEstimatedTokens).toBeGreaterThan(0);
    } finally {
      await fs.rm(outputDir, {force: true, recursive: true});
    }
  });

  it('routes CLI eval commands without requiring a real provider', async () => {
    const handlers = {
      evalList: vi.fn(() => Promise.resolve()),
      evalReport: vi.fn(() => Promise.resolve()),
      evalRun: vi.fn(() => Promise.resolve()),
      runRoot: vi.fn(() => Promise.resolve()),
    };
    const program = buildProgram(new Proxy(handlers, {
      get(target, property: string) {
        return property in target ? target[property as keyof typeof target] : vi.fn(() => Promise.resolve());
      },
    }) as never);
    program.exitOverride();

    await program.parseAsync(['node', 'opencode', 'eval', 'list']);
    await program.parseAsync(['node', 'opencode', 'eval', 'run', 'smoke']);
    await program.parseAsync(['node', 'opencode', 'eval', 'result', 'smoke']);

    expect(handlers.evalList).toHaveBeenCalledTimes(1);
    expect(handlers.evalRun).toHaveBeenCalledWith('smoke', {});
    expect(handlers.evalReport).toHaveBeenCalledWith('smoke');
  });
});
