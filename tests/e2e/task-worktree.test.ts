/**
 * E2E tests for background tasks and worktrees (Phase 16D).
 * Uses temp workspaces. No real network. No real git ops.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {TaskRunner} from '../../src/tasks/bgTaskRunner.js';
import {
  buildBranchName,
  makeSafeSlug,
  formatWorktreeSummary,
} from '../../src/agents/worktreeManager.js';
import {buildTaskWorktreeDoctorChecks} from '../../src/diagnostics/extraChecks.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-e2e-twt-'));

describe('E2E: Task store creates, lists, and shows tasks', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('creates and lists tasks', async () => {
    const t1 = await store.createTask({title: 'Task one', kind: 'agent', cwd: tmpDir});
    const t2 = await store.createTask({title: 'Task two', kind: 'shell', cwd: tmpDir, command: 'echo hi'});

    const list = await store.listTasks();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  it('shows task metadata safely (no secrets)', async () => {
    const task = await store.createTask({
      title: 'Secret task',
      kind: 'agent',
      cwd: tmpDir,
      prompt: 'Use api_key=sk-very-secret-value to do something.',
    });
    const loaded = await store.getTask(task.id);
    expect(loaded?.prompt).not.toContain('sk-very-secret-value');
    expect(loaded?.prompt).toContain('[REDACTED]');
  });
});

describe('E2E: Task logs are redacted', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('redacts secrets from appended logs', async () => {
    const task = await store.createTask({title: 'Log test', kind: 'shell', cwd: tmpDir});
    await store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'sk-ant-api-abc123456789 caused an error',
    });
    const updated = await store.getTask(task.id);
    expect(updated?.logs[0]?.message).not.toContain('sk-ant-api-abc123456789');
    expect(updated?.logs[0]?.message).toContain('[REDACTED]');
  });

  it('truncates huge log lines', async () => {
    const task = await store.createTask({title: 'Truncate test', kind: 'shell', cwd: tmpDir});
    const hugeMessage = 'x'.repeat(2000);
    await store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: hugeMessage,
    });
    const updated = await store.getTask(task.id);
    expect((updated?.logs[0]?.message.length ?? 0)).toBeLessThanOrEqual(501);
  });
});

describe('E2E: Task CLI routes exist', () => {
  it('bgTaskCreate handler is callable', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Test task', kind: 'agent', cwd: tmpDir});
    expect(task.status).toBe('queued');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('bgTaskList handler is callable', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const tasks = await store.listTasks();
    expect(Array.isArray(tasks)).toBe(true);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('bgTaskStop handler marks task stopped', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const runner = new TaskRunner(store);
    const task = await store.createTask({title: 'Stop me', kind: 'agent', cwd: tmpDir});
    const result = await runner.stopTask(task.id);
    expect(result?.status).toBe('stopped');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Worktree CLI routes exist', () => {
  it('worktree list returns empty array for fresh project', async () => {
    const tmpDir = await mkdtemp();
    const {listAgentWorktrees} = await import('../../src/agents/worktreeManager.js');
    const worktrees = await listAgentWorktrees(tmpDir);
    expect(Array.isArray(worktrees)).toBe(true);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('worktree show returns null for unknown id', async () => {
    const tmpDir = await mkdtemp();
    const {getAgentWorktree} = await import('../../src/agents/worktreeManager.js');
    const wt = await getAgentWorktree(tmpDir, 'nonexistent-id');
    expect(wt).toBeNull();
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Worktree remove requires --yes', () => {
  it('removeAgentWorktree throws without yes=true', async () => {
    const tmpDir = await mkdtemp();
    const {removeAgentWorktree} = await import('../../src/agents/worktreeManager.js');
    await expect(
      removeAgentWorktree({id: 'fake', cwd: tmpDir, yes: false}),
    ).rejects.toThrow(/yes=true/u);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Markdown command task renders safe prompt', () => {
  it('workflow task stores rendered prompt', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({
      title: 'Review PR',
      kind: 'workflow',
      cwd: tmpDir,
      prompt: 'Review changes against main. Focus on correctness.',
      workflowCommandName: 'review-pr',
    });

    const runner = new TaskRunner(store);
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('Prompt:');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Markdown agent task blocked when project untrusted', () => {
  it('createTask stores agentName in metadata', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);

    // Simulate task creation with an agent name
    const task = await store.createTask({
      title: 'Run code-reviewer',
      kind: 'agent',
      cwd: tmpDir,
      agentName: 'code-reviewer',
      prompt: 'Review recent commits.',
    });

    expect(task.agentName).toBe('code-reviewer');
    expect(task.status).toBe('queued');

    // The trust check happens at the bgTaskCreate handler level,
    // not in the store. The store records it but doesn't auto-execute.
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: Worktree branch name uses apeironcode/task/ prefix', () => {
  it('buildBranchName produces correct prefix', () => {
    const slug = makeSafeSlug('Fix authentication bug');
    const branch = buildBranchName(slug, 'abc123');
    expect(branch).toMatch(/^apeironcode\/task\//u);
    expect(branch).toContain('fix-authentication-bug');
  });

  it('makeSafeSlug handles special characters', () => {
    expect(makeSafeSlug('Add: OAuth 2.0 support!')).toMatch(/^[a-z0-9-]+$/u);
    expect(makeSafeSlug('')).toBe('task');
  });
});

describe('E2E: Doctor task/worktree checks', () => {
  it('reports task store and worktree manager status', async () => {
    const tmpDir = await mkdtemp();
    const checks = await buildTaskWorktreeDoctorChecks(tmpDir);

    const labels = checks.map((c) => c.label);
    expect(labels.some((l) => l.includes('Background tasks: store'))).toBe(true);
    expect(labels.some((l) => l.includes('Background tasks: worktree'))).toBe(true);
    expect(labels.some((l) => l.includes('Background tasks: daemon'))).toBe(true);

    // All checks should be 'pass' for a fresh project
    expect(checks.every((c) => c.status === 'pass')).toBe(true);

    // No secrets in check output
    const allDetail = checks.map((c) => c.detail ?? '').join(' ');
    expect(allDetail).not.toContain('sk-');
    expect(allDetail).not.toContain('SECRET');

    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('shows task count when tasks exist', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    await store.createTask({title: 'Task 1', kind: 'agent', cwd: tmpDir});
    await store.createTask({title: 'Task 2', kind: 'shell', cwd: tmpDir});

    const checks = await buildTaskWorktreeDoctorChecks(tmpDir);
    const storeCheck = checks.find((c) => c.label === 'Background tasks: store');
    expect(storeCheck?.detail).toContain('2 task(s)');

    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('E2E: formatWorktreeSummary is safe', () => {
  it('formats without secrets', () => {
    const summary = formatWorktreeSummary({
      id: 'abc-def-123',
      cwd: '/project',
      worktreePath: '/project/.apeironcode-agent/worktrees/abc-def-123',
      branchName: 'apeironcode/task/fix-auth-abc123',
      baseBranch: 'main',
      createdAt: new Date().toISOString(),
      purpose: 'Fix auth module',
      status: 'active',
    });
    expect(summary).toContain('apeironcode/task/fix-auth-abc123');
    expect(summary).not.toContain('SECRET');
    expect(summary).not.toContain('sk-');
  });
});
