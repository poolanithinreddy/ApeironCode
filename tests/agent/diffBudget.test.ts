import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {afterEach, describe, expect, it} from 'vitest';

import {calculateDiffStats, enforceDiffBudget, formatDiffBudgetReport} from '../../src/agent/diffBudget.js';

const execFileAsync = promisify(execFile);

describe('diffBudget', () => {
  const dirs: string[] = [];
  const makeRepo = async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-diff-'));
    dirs.push(cwd);
    await execFileAsync('git', ['init'], {cwd});
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], {cwd});
    await execFileAsync('git', ['config', 'user.name', 'Test'], {cwd});
    await fs.writeFile(path.join(cwd, 'a.ts'), 'one\n');
    await execFileAsync('git', ['add', '.'], {cwd});
    await execFileAsync('git', ['commit', '-m', 'initial'], {cwd});
    return cwd;
  };

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, {force: true, recursive: true})));
  });

  it('blocks excessive changed files and deleted lines', async () => {
    const cwd = await makeRepo();
    await fs.writeFile(path.join(cwd, 'a.ts'), '');
    await fs.writeFile(path.join(cwd, 'b.ts'), 'new\n');
    const stats = await calculateDiffStats(cwd, ['a.ts', 'b.ts']);
    const decision = enforceDiffBudget(stats, {maxChangedFiles: 1, maxChangedLines: 10, maxDeletedLines: 0, maxDiffBytes: 10_000});

    expect(decision.blocked).toBe(true);
    expect(decision.warnings.join('\n')).toContain('Changed file count');
    expect(formatDiffBudgetReport(stats)).toContain('Files changed: 2');
  });

  it('requires approval for package/config and generated files', () => {
    const decision = enforceDiffBudget({
      addedLines: 1,
      changedFiles: ['package.json', 'dist/app.js'],
      deletedLines: 0,
      diffBytes: 10,
      generatedFiles: ['dist/app.js'],
      highRiskFiles: ['package.json'],
    }, {maxChangedFiles: 5, maxChangedLines: 10, maxDeletedLines: 10, maxDiffBytes: 1000});

    expect(decision.requiresApproval).toBe(true);
    expect(decision.blocked).toBe(false);
  });

  it('blocks protected paths', () => {
    const decision = enforceDiffBudget({
      addedLines: 1,
      changedFiles: ['.env'],
      deletedLines: 0,
      diffBytes: 10,
      generatedFiles: [],
      highRiskFiles: [],
    }, {maxChangedFiles: 5, maxChangedLines: 10, maxDeletedLines: 10, maxDiffBytes: 1000});

    expect(decision.blocked).toBe(true);
    expect(decision.warnings.join('\n')).toContain('Protected path');
  });
});
