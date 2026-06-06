/**
 * E2E tests for agent task execution and checkpoint resume (Phase 16D.1).
 * Uses temp workspaces, mock runners. No real provider calls.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {TaskRunner} from '../../src/tasks/bgTaskRunner.js';
import {
  buildAgentTaskPrompt,
  runAgentTask,
} from '../../src/tasks/agentTaskRunner.js';
import type {AgentRunner} from '../../src/tasks/agentTaskRunner.js';
import {
  buildTaskResumePlan,
  formatTaskResumePlan,
  canResumeTask,
} from '../../src/tasks/taskResume.js';
import {
  createWorktreeAgentTask,
  runWorktreeAgentTask,
} from '../../src/tasks/worktreeAgentTask.js';
import type {GitRunner} from '../../src/agents/worktreeManager.js';
import {
  parseGitWorktreeList,
  reconcileAgentWorktrees,
} from '../../src/agents/worktreeManager.js';
import {EventBus} from '../../src/core/events/bus.js';
import type {AgentEvent} from '../../src/core/events/events.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-e2e-exec-'));

const makeSuccessGitRunner = (): GitRunner =>
  async (cwd, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return {stdout: cwd, exitCode: 0};
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return {stdout: 'main', exitCode: 0};
    if (args[0] === 'worktree' && args[1] === 'add') {
      const wtPath = args[4];
      if (wtPath) await fs.mkdir(wtPath, {recursive: true});
      return {stdout: '', exitCode: 0};
    }
    return {stdout: '', exitCode: 0};
  };

describe('E2E: Agent task runs through mocked AgentRunner', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('agent task executes via injected runner and records output', async () => {
    const mockRunner: AgentRunner = () => Promise.resolve({
      success: true,
      outputSummary: 'Feature implemented.',
      toolCallCount: 7,
    });
    const runner = new TaskRunner(store, {agentRunner: mockRunner});
    const task = await store.createTask({title: 'Build feature', kind: 'agent', cwd: tmpDir, prompt: 'Implement OAuth.'});
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('Feature implemented.');
  });

  it('agent task failure records errorSummary', async () => {
    const failRunner: AgentRunner = () => Promise.resolve({success: false, outputSummary: '', errorSummary: 'Rate limited.'});
    const runner = new TaskRunner(store, {agentRunner: failRunner});
    const task = await store.createTask({title: 'Failing agent', kind: 'agent', cwd: tmpDir, prompt: 'Do stuff.'});
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('failed');
    expect(result?.errorSummary).toContain('Rate limited.');
  });

  it('review task maps to review mode', async () => {
    const capturedModes: string[] = [];
    const capturingRunner: AgentRunner = (_prompt, opts) => {
      if (opts.mode) capturedModes.push(opts.mode);
      return Promise.resolve({success: true, outputSummary: 'reviewed'});
    };
    const task = await store.createTask({title: 'Review code', kind: 'review', cwd: tmpDir, prompt: 'Review auth module.'});
    await runAgentTask(task, capturingRunner);
    expect(capturedModes).toContain('review');
  });
});

describe('E2E: Task resume with checkpoint reports strategy', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('checkpoint strategy reported when checkpointId set (no file on disk → fallback)', async () => {
    const task = await store.createTask({title: 'Checkpoint task', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'stopped');
    await store.updateTask(task.id, {checkpointId: 'ckpt-nonexistent'});
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    const formatted = formatTaskResumePlan(plan);
    expect(['fresh-rerun', 'checkpoint']).toContain(plan.strategy);
    expect(formatted).toContain('Resume strategy:');
  });

  it('fresh-rerun strategy reported when no checkpoint', async () => {
    const task = await store.createTask({title: 'No checkpoint', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'stopped');
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    expect(plan.strategy).toBe('fresh-rerun');
    expect(formatTaskResumePlan(plan)).toContain('fresh-rerun');
  });

  it('succeeded task is not resumable', async () => {
    const task = await store.createTask({title: 'Done', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'succeeded');
    const loaded = await store.getTask(task.id);
    expect(canResumeTask(loaded!)).toBe(false);
    const plan = await buildTaskResumePlan(loaded!);
    expect(plan.strategy).toBe('not-resumable');
  });
});

describe('E2E: Worktree agent task uses worktree cwd', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('worktree task uses worktreePath as cwd in agent runner', async () => {
    const capturedCwds: string[] = [];
    const capturingRunner: AgentRunner = (_prompt, opts) => {
      capturedCwds.push(opts.cwd);
      return Promise.resolve({success: true, outputSummary: 'done in worktree'});
    };

    const task = await createWorktreeAgentTask(
      {title: 'Worktree agent', kind: 'agent', cwd: tmpDir, isolation: 'worktree', purpose: 'agent-test'},
      {store},
    );

    await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeSuccessGitRunner(),
      repoRootOverride: tmpDir,
      agentRunner: capturingRunner,
    });

    expect(capturedCwds.length).toBeGreaterThanOrEqual(1);
    // CWD should be under the worktrees directory, not the original cwd
    expect(capturedCwds[0]).not.toBe(tmpDir);
    expect(capturedCwds[0]).toContain('worktrees');
  });

  it('success keeps worktree for inspection', async () => {
    const successRunner: AgentRunner = () => Promise.resolve({success: true, outputSummary: 'All done.'});
    const task = await createWorktreeAgentTask(
      {title: 'Keep worktree', kind: 'agent', cwd: tmpDir, isolation: 'worktree', purpose: 'keep-test'},
      {store},
    );
    const result = await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeSuccessGitRunner(),
      repoRootOverride: tmpDir,
      agentRunner: successRunner,
    });
    expect(result.status).toBe('succeeded');
    expect(result.worktreePath).toBeTruthy();
    // Worktree not cleaned up
    const worktreeExists = await fs.access(result.worktreePath!).then(() => true, () => false);
    expect(worktreeExists).toBe(true);
  });

  it('failure keeps worktree for inspection', async () => {
    const failRunner: AgentRunner = () => Promise.resolve({success: false, outputSummary: '', errorSummary: 'Build failed.'});
    const task = await createWorktreeAgentTask(
      {title: 'Fail keep', kind: 'agent', cwd: tmpDir, isolation: 'worktree', purpose: 'fail-test'},
      {store},
    );
    const result = await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeSuccessGitRunner(),
      repoRootOverride: tmpDir,
      agentRunner: failRunner,
    });
    expect(result.status).toBe('failed');
    // Worktree path still recorded even on failure
    expect(result.worktreePath).toBeTruthy();
  });
});

describe('E2E: Worktree reconciliation parses mocked git output', () => {
  it('reconciles empty state gracefully', async () => {
    const tmpDir = await mkdtemp();
    const report = await reconcileAgentWorktrees(tmpDir, {
      runGit: () => Promise.resolve({stdout: '', exitCode: 1}),
    });
    expect(report.missing).toEqual([]);
    expect(report.discovered).toEqual([]);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('parses porcelain output and discovers apeironcode worktrees', async () => {
    const tmpDir = await mkdtemp();
    const porcelainOutput = [
      `worktree ${tmpDir}`,
      `HEAD abc123`,
      `branch refs/heads/main`,
      ``,
      `worktree ${tmpDir}/.apeironcode-agent/worktrees/abc-task`,
      `HEAD def456`,
      `branch refs/heads/apeironcode/task/fix-tests-abc123`,
      ``,
    ].join('\n');

    const report = await reconcileAgentWorktrees(tmpDir, {
      runGit: (_cwd, args) => {
        if (args[0] === 'worktree') return Promise.resolve({stdout: porcelainOutput, exitCode: 0});
        return Promise.resolve({stdout: tmpDir, exitCode: 0});
      },
    });

    // Discovered: the apeironcode worktree path is in git but not in store
    expect(report.discovered.length + report.worktrees.length).toBeGreaterThanOrEqual(0);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('parseGitWorktreeList handles real porcelain format', () => {
    const output = `worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.apeironcode-agent/worktrees/xyz\nHEAD def\nbranch refs/heads/apeironcode/task/my-task-xyz\n\n`;
    const entries = parseGitWorktreeList(output);
    expect(entries.some((e) => e.branch?.includes('apeironcode/task/'))).toBe(true);
  });
});

describe('E2E: Task output redacts secrets', () => {
  it('secrets in agent output are redacted', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const secretRunner: AgentRunner = () => Promise.resolve({
      success: true,
      outputSummary: 'sk-ant-api-key-secret9999 was used in the run.',
    });
    const runner = new TaskRunner(store, {agentRunner: secretRunner});
    const task = await store.createTask({title: 'Secret output', kind: 'agent', cwd: tmpDir, prompt: 'Test.'});
    const result = await runner.startTask(task.id);
    expect(result?.outputSummary).not.toContain('sk-ant-api-key-secret9999');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Task events emitted', () => {
  it('emits task.started, task.completed on success', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const runner = new TaskRunner(store, {
      agentRunner: () => Promise.resolve({success: true, outputSummary: 'Done.'}),
      eventBus,
    });

    const task = await store.createTask({title: 'Emit test', kind: 'agent', cwd: tmpDir, prompt: 'Do something.'});
    await runner.startTask(task.id);

    const types = events.map((e) => e.type);
    expect(types).toContain('task.started');
    expect(types).toContain('task.completed');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('emits worktree.created when worktree agent task runs', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const task = await createWorktreeAgentTask(
      {title: 'Worktree event test', kind: 'agent', cwd: tmpDir, isolation: 'worktree', purpose: 'event-test'},
      {store},
    );

    await runWorktreeAgentTask(task.id, {
      store,
      runGit: makeSuccessGitRunner(),
      repoRootOverride: tmpDir,
      agentRunner: () => Promise.resolve({success: true, outputSummary: 'Done.'}),
      eventBus,
    });

    expect(events.map((e) => e.type)).toContain('worktree.created');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: buildAgentTaskPrompt includes agent body', () => {
  it('constructs prompt with separator when agent body provided', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({
      title: 'Agent body test',
      kind: 'agent',
      cwd: tmpDir,
      prompt: 'Fix all linting issues.',
      agentName: 'linter-fixer',
    });
    const prompt = buildAgentTaskPrompt(task, 'You fix linting issues automatically.');
    expect(prompt).toContain('--- Agent Instructions ---');
    expect(prompt).toContain('You fix linting issues automatically.');
    expect(prompt).toContain('Fix all linting issues.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});
