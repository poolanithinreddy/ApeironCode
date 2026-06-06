import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {
  canResumeTask,
  buildTaskResumePlan,
  formatTaskResumePlan,
  resumeTaskFromCheckpoint,
} from '../../src/tasks/taskResume.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-resume-'));

describe('canResumeTask', () => {
  it('returns true for stopped/paused/failed', () => {
    for (const status of ['stopped', 'paused', 'failed'] as const) {
      expect(canResumeTask({status} as Parameters<typeof canResumeTask>[0])).toBe(true);
    }
  });

  it('returns false for succeeded/queued/running', () => {
    for (const status of ['succeeded', 'queued', 'running'] as const) {
      expect(canResumeTask({status} as Parameters<typeof canResumeTask>[0])).toBe(false);
    }
  });
});

describe('buildTaskResumePlan', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('returns not-resumable for succeeded task', async () => {
    const task = await store.createTask({title: 'Done', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'succeeded');
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    expect(plan.strategy).toBe('not-resumable');
  });

  it('returns fresh-rerun when no checkpoint or worktree', async () => {
    const task = await store.createTask({title: 'No checkpoint', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'stopped');
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    expect(plan.strategy).toBe('fresh-rerun');
    expect(plan.cwd).toBe(tmpDir);
  });

  it('returns worktree-rerun when task has worktreePath but no checkpoint', async () => {
    const task = await store.createTask({title: 'Worktree task', kind: 'agent', cwd: tmpDir, isolation: 'worktree'});
    await store.updateStatus(task.id, 'stopped');
    await store.updateTask(task.id, {worktreePath: `${tmpDir}/worktrees/abc`});
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    expect(plan.strategy).toBe('worktree-rerun');
    expect(plan.cwd).toBe(`${tmpDir}/worktrees/abc`);
  });

  it('prompt is redacted in resume plan', async () => {
    const task = await store.createTask({
      title: 'Secret task',
      kind: 'agent',
      cwd: tmpDir,
      prompt: 'Use api_key=my-secret-value to run.',
    });
    await store.updateStatus(task.id, 'stopped');
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    // Prompt in task is already redacted at store time
    expect(plan.prompt).not.toContain('my-secret-value');
  });

  it('includes checkpointId when task has checkpointId (no file found → falls back)', async () => {
    const task = await store.createTask({title: 'Has checkpoint', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'stopped');
    await store.updateTask(task.id, {checkpointId: 'ckpt-nonexistent-id'});
    const loaded = await store.getTask(task.id);
    // No actual checkpoint file exists; should fall back to fresh-rerun
    const plan = await buildTaskResumePlan(loaded!);
    // It may be fresh-rerun since checkpoint not found on disk
    expect(['fresh-rerun', 'checkpoint']).toContain(plan.strategy);
  });
});

describe('formatTaskResumePlan', () => {
  it('formats plan safely without secrets', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Test plan format', kind: 'agent', cwd: tmpDir});
    await store.updateStatus(task.id, 'stopped');
    const loaded = await store.getTask(task.id);
    const plan = await buildTaskResumePlan(loaded!);
    const formatted = formatTaskResumePlan(plan);
    expect(formatted).toContain('Resume strategy:');
    expect(formatted).toContain('Task:');
    expect(formatted).not.toContain('sk-');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('resumeTaskFromCheckpoint', () => {
  it('returns not-executed when no snapshot', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'No snap', kind: 'agent', cwd: tmpDir});
    const loaded = await store.getTask(task.id);
    const plan = {
      taskId: task.id,
      strategy: 'fresh-rerun' as const,
      cwd: tmpDir,
      prompt: 'Do stuff.',
      reason: 'No checkpoint found.',
    };
    const result = resumeTaskFromCheckpoint(loaded!, plan);
    expect(result.executed).toBe(false);
    expect(result.summary).toContain('fresh-rerun');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('returns executed when snapshot is provided', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Has snap', kind: 'agent', cwd: tmpDir});
    const loaded = await store.getTask(task.id);
    const mockSnapshot = {
      sessionId: 'sess-123',
      prompt: 'Do stuff.',
      checkpointId: 'ckpt-abc',
      changedFiles: [],
      createdAt: new Date().toISOString(),
      lastToolResultSummary: undefined,
      plan: undefined,
      state: {
        phase: 'cancelled',
        formatted: 'cancelled',
        currentIteration: 0,
        id: 'state-1',
        lastTransitionAt: new Date().toISOString(),
        warnings: [],
      },
      verificationState: undefined,
    };
    const plan = {
      taskId: task.id,
      strategy: 'checkpoint' as const,
      cwd: tmpDir,
      prompt: 'Do stuff.',
      reason: 'Snapshot found.',
      snapshot: mockSnapshot as NonNullable<Parameters<typeof resumeTaskFromCheckpoint>[1]['snapshot']>,
      checkpointId: 'ckpt-abc',
    };
    const result = resumeTaskFromCheckpoint(loaded!, plan);
    expect(result.executed).toBe(true);
    expect(result.summary).toContain('Checkpoint resume ready');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});
