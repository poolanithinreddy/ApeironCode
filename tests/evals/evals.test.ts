import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {formatEvalList, formatEvalReport} from '../../src/evals/format.js';
import {runEval} from '../../src/evals/runner.js';

describe('local eval compatibility', () => {
  it('keeps legacy eval list and run imports working against real suites', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-evals-'));

    expect(formatEvalList()).toContain('smoke');
    const report = await runEval(cwd, 'smoke');

    expect(report.results[0]?.status).toBe('pass');
    expect(formatEvalReport(report)).toContain('Evaluation Report');
    await fs.rm(cwd, {force: true, recursive: true});
  });

  it('records unknown eval suites as failed reports with guidance', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-evals-'));
    const report = await runEval(cwd, 'missing');

    expect(report.results[0]?.status).toBe('fail');
    expect(formatEvalReport(report)).toContain('Unknown evaluation suite');
    await fs.rm(cwd, {force: true, recursive: true});
  });
});
