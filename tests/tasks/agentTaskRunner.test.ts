import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {
  buildAgentTaskPrompt,
  buildAgentTaskOptions,
  runAgentTask,
  summarizeAgentTaskResult,
  formatAgentTaskRunLog,
} from '../../src/tasks/agentTaskRunner.js';
import type {AgentRunner, AgentTaskRunResult} from '../../src/tasks/agentTaskRunner.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-agentrunner-'));

const makeSuccessRunner = (output = 'Done.'): AgentRunner =>
  () => Promise.resolve({success: true, outputSummary: output, toolCallCount: 3});

const makeFailRunner = (error = 'Something failed'): AgentRunner =>
  () => Promise.resolve({success: false, outputSummary: '', errorSummary: error});

describe('buildAgentTaskPrompt', () => {
  it('uses task.prompt when no agent body', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Fix tests', kind: 'agent', cwd: tmpDir, prompt: 'Fix all failing tests.'});
    expect(buildAgentTaskPrompt(task)).toBe('Fix all failing tests.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('falls back to task.title when no prompt', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'No prompt task', kind: 'agent', cwd: tmpDir});
    expect(buildAgentTaskPrompt(task)).toBe('No prompt task');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('prepends agent body with separator', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Task', kind: 'agent', cwd: tmpDir, prompt: 'Do the thing.'});
    const prompt = buildAgentTaskPrompt(task, 'You are a careful reviewer.');
    expect(prompt).toContain('--- Agent Instructions ---');
    expect(prompt).toContain('You are a careful reviewer.');
    expect(prompt).toContain('Do the thing.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('buildAgentTaskOptions', () => {
  it('uses worktreePath as cwd when set', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Worktree task', kind: 'agent', cwd: tmpDir, isolation: 'worktree'});
    const withWorktree = await store.updateTask(task.id, {worktreePath: '/project/worktrees/abc'});
    const opts = buildAgentTaskOptions(withWorktree!);
    expect(opts.cwd).toBe('/project/worktrees/abc');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('uses task.cwd when no worktreePath', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Plain task', kind: 'agent', cwd: tmpDir});
    const opts = buildAgentTaskOptions(task);
    expect(opts.cwd).toBe(tmpDir);
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('maps review kind to review mode', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Code review', kind: 'review', cwd: tmpDir});
    const opts = buildAgentTaskOptions(task);
    expect(opts.mode).toBe('review');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('maps test-fix kind to test-fix mode', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Fix tests', kind: 'test-fix', cwd: tmpDir});
    const opts = buildAgentTaskOptions(task);
    expect(opts.mode).toBe('test-fix');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('runAgentTask', () => {
  let tmpDir: string;
  let store: BgTaskStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('calls the injected runner with the task prompt', async () => {
    const calls: Array<{prompt: string}> = [];
    const runner: AgentRunner = (prompt) => {
      calls.push({prompt});
      return Promise.resolve({success: true, outputSummary: 'done', toolCallCount: 1});
    };
    const task = await store.createTask({title: 'Test run', kind: 'agent', cwd: tmpDir, prompt: 'Do the thing.'});
    await runAgentTask(task, runner);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toContain('Do the thing.');
  });

  it('returns success result from runner', async () => {
    const task = await store.createTask({title: 'Success', kind: 'agent', cwd: tmpDir, prompt: 'Fix auth.'});
    const result = await runAgentTask(task, makeSuccessRunner('Auth fixed.'));
    expect(result.success).toBe(true);
    expect(result.outputSummary).toContain('Auth fixed.');
  });

  it('returns failure result from runner', async () => {
    const task = await store.createTask({title: 'Fail', kind: 'agent', cwd: tmpDir});
    const result = await runAgentTask(task, makeFailRunner('Provider error'));
    expect(result.success).toBe(false);
    expect(result.errorSummary).toContain('Provider error');
  });

  it('redacts secrets from output', async () => {
    const secretRunner: AgentRunner = () => Promise.resolve({
      success: true,
      outputSummary: 'Used sk-ant-api-secret12345 token to complete.',
    });
    const task = await store.createTask({title: 'Secret output', kind: 'agent', cwd: tmpDir});
    const result = await runAgentTask(task, secretRunner);
    expect(result.outputSummary).not.toContain('sk-ant-api-secret12345');
  });

  it('handles runner throwing an exception', async () => {
    const throwingRunner: AgentRunner = () => {
      throw new Error('Network timeout');
    };
    const task = await store.createTask({title: 'Crash test', kind: 'agent', cwd: tmpDir});
    const result = await runAgentTask(task, throwingRunner);
    expect(result.success).toBe(false);
    expect(result.errorSummary).toContain('Network timeout');
  });

  it('includes agent body in prompt when provided', async () => {
    const captured: string[] = [];
    const capturingRunner: AgentRunner = (prompt) => {
      captured.push(prompt);
      return Promise.resolve({success: true, outputSummary: 'ok'});
    };
    const task = await store.createTask({title: 'With agent body', kind: 'agent', cwd: tmpDir, prompt: 'Do task.'});
    await runAgentTask(task, capturingRunner, {agentBody: 'You are a TypeScript expert.', cwd: tmpDir});
    expect(captured[0]).toContain('You are a TypeScript expert.');
    expect(captured[0]).toContain('Do task.');
  });
});

describe('summarizeAgentTaskResult', () => {
  it('includes success/failure and output', () => {
    const result: AgentTaskRunResult = {
      success: true,
      outputSummary: 'All tests pass.',
      toolCallCount: 5,
      sessionId: 'abc-123',
    };
    const summary = summarizeAgentTaskResult(result);
    expect(summary).toContain('completed successfully');
    expect(summary).toContain('All tests pass.');
    expect(summary).toContain('Tool calls: 5');
  });

  it('includes error for failures', () => {
    const result: AgentTaskRunResult = {success: false, outputSummary: '', errorSummary: 'Provider timeout'};
    const summary = summarizeAgentTaskResult(result);
    expect(summary).toContain('failed');
    expect(summary).toContain('Provider timeout');
  });
});

describe('formatAgentTaskRunLog', () => {
  it('redacts secrets in run log', () => {
    const result: AgentTaskRunResult = {
      success: true,
      outputSummary: 'Token sk-ant-api-secret789 was used.',
    };
    const log = formatAgentTaskRunLog(result);
    expect(log).not.toContain('sk-ant-api-secret789');
  });
});
