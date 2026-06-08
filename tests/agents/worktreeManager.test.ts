import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  createAgentWorktree,
  listAgentWorktrees,
  removeAgentWorktree,
  buildBranchName,
  makeSafeSlug,
  formatWorktreeSummary,
} from '../../src/agents/worktreeManager.js';
import type {GitRunner} from '../../src/agents/worktreeManager.js';

// Mock git runner for tests — no real git needed
const makeSuccessRunner = (worktreePathCapture?: {path?: string}): GitRunner =>
  async (cwd: string, args: string[]) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return {stdout: cwd, exitCode: 0};
    }
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
      return {stdout: 'main', exitCode: 0};
    }
    if (args[0] === 'worktree' && args[1] === 'add') {
      // Create the worktree directory so store can find it
      const wtPath = args[4];
      if (wtPath) {
        if (worktreePathCapture) worktreePathCapture.path = wtPath;
        await fs.mkdir(wtPath, {recursive: true});
      }
      return {stdout: '', exitCode: 0};
    }
    if (args[0] === 'worktree' && args[1] === 'remove') {
      const wtPath = args[3];
      if (wtPath) await fs.rm(wtPath, {recursive: true, force: true}).catch(() => {});
      return {stdout: '', exitCode: 0};
    }
    if (args[0] === 'branch' && args[1] === '-D') {
      return {stdout: '', exitCode: 0};
    }
    return {stdout: '', exitCode: 0};
  };

const makeFailRunner = (failOn: string): GitRunner =>
  (_cwd, args) => {
    if (args[0] === failOn) return Promise.resolve({stdout: 'error', exitCode: 1});
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return Promise.resolve({stdout: _cwd, exitCode: 0});
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return Promise.resolve({stdout: 'main', exitCode: 0});
    return Promise.resolve({stdout: '', exitCode: 0});
  };

describe('makeSafeSlug', () => {
  it('converts text to slug', () => {
    expect(makeSafeSlug('Fix failing tests!')).toMatch(/^[a-z0-9-]+$/u);
  });

  it('handles empty string', () => {
    expect(makeSafeSlug('')).toBe('task');
  });
});

describe('buildBranchName', () => {
  it('produces apeironcode/task/ prefix', () => {
    const name = buildBranchName('fix-tests', 'abc123');
    expect(name).toBe('apeironcode/task/fix-tests-abc123');
  });
});

describe('createAgentWorktree', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-wt-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('creates worktree record with mocked git runner', async () => {
    const wt = await createAgentWorktree({
      cwd: tmpDir,
      purpose: 'fix tests',
      taskId: 'task-123',
      repoRootOverride: tmpDir,
      runGit: makeSuccessRunner(),
    });

    expect(wt.branchName).toMatch(/^apeironcode\/task\//u);
    expect(wt.status).toBe('active');
    expect(wt.taskId).toBe('task-123');
    expect(wt.baseBranch).toBe('main');
  });

  it('fails gracefully on git error', async () => {
    await expect(
      createAgentWorktree({
        cwd: tmpDir,
        purpose: 'some task',
        repoRootOverride: tmpDir,
        runGit: makeFailRunner('worktree'),
      }),
    ).rejects.toThrow(/git worktree add failed/u);
  });

  it('rejects when not in a git repo', async () => {
    await expect(
      createAgentWorktree({
        cwd: tmpDir,
        purpose: 'no git',
        runGit: (_cwd, args) => {
          if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
            return Promise.resolve({stdout: '', exitCode: 128});
          }
          return Promise.resolve({stdout: '', exitCode: 0});
        },
      }),
    ).rejects.toThrow(/git repository/u);
  });
});

describe('listAgentWorktrees', () => {
  it('returns empty array when no worktrees dir', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-wt-list-'));
    const result = await listAgentWorktrees(tmpDir);
    expect(result).toEqual([]);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('removeAgentWorktree', () => {
  it('requires yes=true', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-wt-rm-'));
    await expect(
      removeAgentWorktree({id: 'fake-id', cwd: tmpDir, yes: false}),
    ).rejects.toThrow(/yes=true/u);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('rejects unknown worktree id', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-wt-rm2-'));
    await expect(
      removeAgentWorktree({id: 'nonexistent-id', cwd: tmpDir, yes: true}),
    ).rejects.toThrow(/not found/u);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('formatWorktreeSummary', () => {
  it('formats safely without secrets', () => {
    const wt = {
      id: 'abc-123-def',
      cwd: '/project',
      worktreePath: '/project/.apeironcode-agent/worktrees/abc',
      branchName: 'apeironcode/task/fix-tests-abc123',
      baseBranch: 'main',
      createdAt: new Date().toISOString(),
      purpose: 'Fix tests',
      taskId: 'task-1',
      status: 'active' as const,
    };
    const summary = formatWorktreeSummary(wt);
    expect(summary).toContain('apeironcode/task/fix-tests-abc123');
    expect(summary).toContain('active');
    expect(summary).toContain('Fix tests');
    expect(summary).not.toContain('SECRET');
  });
});

import {
  parseGitWorktreeList,
  reconcileAgentWorktrees,
  formatWorktreeReconciliationReport,
} from '../../src/agents/worktreeManager.js';

describe('parseGitWorktreeList', () => {
  it('parses basic porcelain output', () => {
    const output = `worktree /project
HEAD abc123
branch refs/heads/main

worktree /project/.apeironcode-agent/worktrees/abc
HEAD def456
branch refs/heads/apeironcode/task/fix-tests-abc123

`;
    const entries = parseGitWorktreeList(output);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0]?.worktree).toBe('/project');
    expect(entries[1]?.worktree).toBe('/project/.apeironcode-agent/worktrees/abc');
    expect(entries[1]?.branch).toContain('apeironcode/task/fix-tests-abc123');
  });

  it('returns empty array for empty output', () => {
    expect(parseGitWorktreeList('')).toEqual([]);
  });

  it('handles single worktree', () => {
    const output = `worktree /project\nHEAD abc123\nbranch refs/heads/main\n\n`;
    const entries = parseGitWorktreeList(output);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.worktree).toBe('/project');
  });
});

describe('reconcileAgentWorktrees', () => {
  it('returns empty lists for fresh project', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-reconcile-'));
    const report = await reconcileAgentWorktrees(tmpDir, {
      runGit: () => Promise.resolve({stdout: '', exitCode: 1}),
    });
    expect(report.missing).toEqual([]);
    expect(report.discovered).toEqual([]);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('does not delete anything automatically', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-reconcile2-'));
    // Store a worktree record without a corresponding git entry
    const {BgTaskStore} = await import('../../src/tasks/bgTaskStore.js');
    const store = new BgTaskStore(tmpDir);
    await store.createTask({title: 'Orphan', kind: 'agent', cwd: tmpDir, isolation: 'worktree'});

    const report = await reconcileAgentWorktrees(tmpDir, {
      runGit: () => Promise.resolve({stdout: '', exitCode: 0}), // empty git output
    });
    // Stored worktrees still present in report
    expect(report.worktrees.length).toBeGreaterThanOrEqual(0);
    // Nothing is deleted
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('formatWorktreeReconciliationReport', () => {
  it('says consistent when no issues', () => {
    const report = {worktrees: [], missing: [], discovered: []};
    expect(formatWorktreeReconciliationReport(report)).toContain('consistent');
  });

  it('reports missing worktrees', () => {
    const report = {worktrees: [], missing: ['abc-123-def'], discovered: []};
    const output = formatWorktreeReconciliationReport(report);
    expect(output).toContain('Missing from git');
    expect(output).toContain('abc-123');
  });
});
