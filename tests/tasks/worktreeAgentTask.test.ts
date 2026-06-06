import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {
  createWorktreeAgentTask,
  runWorktreeAgentTask,
  summarizeWorktreeTaskResult,
} from '../../src/tasks/worktreeAgentTask.js';
import type {GitRunner} from '../../src/agents/worktreeManager.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-wt-agent-'));

const makeSuccessGitRunner = (): GitRunner =>
  async (cwd, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return {stdout: cwd, exitCode: 0};
    }
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
      return {stdout: 'main', exitCode: 0};
    }
    if (args[0] === 'worktree' && args[1] === 'add') {
      const wtPath = args[4];
      if (wtPath) await fs.mkdir(wtPath, {recursive: true});
      return {stdout: '', exitCode: 0};
    }
    return {stdout: '', exitCode: 0};
  };

const makeFailGitRunner = (): GitRunner =>
  (cwd, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return Promise.resolve({stdout: cwd, exitCode: 0});
    }
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
      return Promise.resolve({stdout: 'main', exitCode: 0});
    }
    if (args[0] === 'worktree') return Promise.resolve({stdout: 'fatal error', exitCode: 1});
    return Promise.resolve({stdout: '', exitCode: 0});
  };

describe('createWorktreeAgentTask', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('creates task with worktree isolation', async () => {
    const task = await createWorktreeAgentTask(
      {
        title: 'Refactor auth module',
        kind: 'agent',
        cwd: tmpDir,
        isolation: 'worktree',
        purpose: 'refactor-auth',
      },
      {store},
    );

    expect(task.isolation).toBe('worktree');
    expect(task.status).toBe('queued');
  });

  it('provisions worktree on runWorktreeAgentTask', async () => {
    const task = await createWorktreeAgentTask(
      {
        title: 'Build feature',
        kind: 'agent',
        cwd: tmpDir,
        isolation: 'worktree',
        purpose: 'build-feature',
      },
      {store},
    );

    const result = await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeSuccessGitRunner(),
      repoRootOverride: tmpDir,
    });

    expect(result.status).toBe('succeeded');
    expect(result.worktreePath).toBeTruthy();
    expect(result.branchName).toMatch(/^apeironcode\/task\//u);
  });

  it('records failure and keeps worktree for inspection when git fails', async () => {
    const task = await createWorktreeAgentTask(
      {
        title: 'Failed task',
        kind: 'agent',
        cwd: tmpDir,
        isolation: 'worktree',
        purpose: 'failed-task',
      },
      {store},
    );

    const result = await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeFailGitRunner(),
      repoRootOverride: tmpDir,
    });

    // Task fails but is kept for inspection
    expect(result.status).toBe('failed');
    expect(result.errorSummary).toBeTruthy();
    // worktreePath is NOT set because provisioning failed
    expect(result.worktreePath).toBeFalsy();
  });

  it('rejects non-worktree task', async () => {
    const task = await store.createTask({
      title: 'Not a worktree task',
      kind: 'agent',
      cwd: tmpDir,
      isolation: 'none',
    });

    await expect(
      runWorktreeAgentTask(task.id, {store, runGit: makeSuccessGitRunner()}),
    ).rejects.toThrow(/not a worktree task/iu);
  });
});

describe('summarizeWorktreeTaskResult', () => {
  it('returns safe summary with next steps', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Summary test', kind: 'agent', cwd: tmpDir, isolation: 'worktree'});
    const loaded = await store.getTask(task.id);
    const summary = summarizeWorktreeTaskResult(
      loaded!,
      '/project/.apeironcode-agent/worktrees/abc',
      'apeironcode/task/my-task-abc123',
    );
    expect(summary).toContain('apeironcode/task/my-task-abc123');
    expect(summary).toContain('Next steps');
    expect(summary).toContain('apeironcode worktree remove');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});
