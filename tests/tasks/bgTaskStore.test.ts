import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {formatTaskSummary, formatTaskList, isResumableStatus} from '../../src/tasks/bgTask.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-bgtask-'));

describe('BgTaskStore', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('creates and retrieves a task', async () => {
    const task = await store.createTask({
      title: 'Fix failing tests',
      kind: 'test-fix',
      cwd: tmpDir,
      prompt: 'Run and fix all failing tests.',
    });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Fix failing tests');
    expect(task.kind).toBe('test-fix');
    expect(task.status).toBe('queued');
    expect(task.isolation).toBe('none');

    const loaded = await store.getTask(task.id);
    expect(loaded?.id).toBe(task.id);
    expect(loaded?.status).toBe('queued');
  });

  it('lists tasks, sorted by updatedAt desc', async () => {
    await store.createTask({title: 'Task A', kind: 'agent', cwd: tmpDir});
    await new Promise((r) => setTimeout(r, 5));
    await store.createTask({title: 'Task B', kind: 'shell', cwd: tmpDir});

    const tasks = await store.listTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]?.title).toBe('Task B'); // most recent first
  });

  it('updates task status', async () => {
    const task = await store.createTask({title: 'Test update', kind: 'agent', cwd: tmpDir});
    const updated = await store.updateStatus(task.id, 'running');
    expect(updated?.status).toBe('running');
    expect(updated?.startedAt).toBeTruthy();
  });

  it('sets completedAt when moving to terminal status', async () => {
    const task = await store.createTask({title: 'Terminal test', kind: 'agent', cwd: tmpDir});
    const updated = await store.updateStatus(task.id, 'succeeded', {outputSummary: 'Done!'});
    expect(updated?.status).toBe('succeeded');
    expect(updated?.completedAt).toBeTruthy();
    expect(updated?.outputSummary).toBe('Done!');
  });

  it('appends task logs and redacts secrets', async () => {
    const task = await store.createTask({title: 'Log test', kind: 'agent', cwd: tmpDir});
    await store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'api_key=supersecret123 was used.',
    });
    const updated = await store.getTask(task.id);
    expect(updated?.logs).toHaveLength(1);
    expect(updated?.logs[0]?.message).not.toContain('supersecret123');
    expect(updated?.logs[0]?.message).toContain('[REDACTED]');
  });

  it('truncates very long logs', async () => {
    const task = await store.createTask({title: 'Log truncate', kind: 'shell', cwd: tmpDir});
    const hugeLogs = Array.from({length: 250}, (_, i) => ({
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      message: `log line ${i}`,
    }));
    for (const log of hugeLogs) {
      await store.appendTaskLog(task.id, log);
    }
    const updated = await store.getTask(task.id);
    expect(updated?.logs.length).toBeLessThanOrEqual(200);
  });

  it('deletes a task', async () => {
    const task = await store.createTask({title: 'Delete me', kind: 'agent', cwd: tmpDir});
    await store.deleteTask(task.id);
    const loaded = await store.getTask(task.id);
    expect(loaded).toBeNull();
  });

  it('filters tasks by status', async () => {
    await store.createTask({title: 'Queued', kind: 'agent', cwd: tmpDir});
    const running = await store.createTask({title: 'Running', kind: 'shell', cwd: tmpDir});
    await store.updateStatus(running.id, 'running');

    const queued = await store.listTasks({status: 'queued'});
    const runningList = await store.listTasks({status: 'running'});
    expect(queued.every((t) => t.status === 'queued')).toBe(true);
    expect(runningList.every((t) => t.status === 'running')).toBe(true);
  });

  it('filters tasks by kind', async () => {
    await store.createTask({title: 'Agent task', kind: 'agent', cwd: tmpDir});
    await store.createTask({title: 'Shell task', kind: 'shell', cwd: tmpDir});

    const agents = await store.listTasks({kind: 'agent'});
    expect(agents.every((t) => t.kind === 'agent')).toBe(true);
  });
});

describe('bgTask helpers', () => {
  it('formatTaskSummary includes key fields', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'My task', kind: 'review', cwd: tmpDir});
    const summary = formatTaskSummary(task);
    expect(summary).toContain('queued');
    expect(summary).toContain('review');
    expect(summary).toContain('My task');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('formatTaskList shows "No background tasks" for empty list', () => {
    expect(formatTaskList([])).toContain('No background tasks');
  });

  it('isResumableStatus returns true for paused/stopped', () => {
    expect(isResumableStatus('paused')).toBe(true);
    expect(isResumableStatus('stopped')).toBe(true);
    expect(isResumableStatus('failed')).toBe(false);
    expect(isResumableStatus('succeeded')).toBe(false);
  });
});
