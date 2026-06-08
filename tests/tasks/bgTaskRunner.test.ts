import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BgTaskStore} from '../../src/tasks/bgTaskStore.js';
import {TaskRunner, formatTaskOutput} from '../../src/tasks/bgTaskRunner.js';
import type {ShellExecutor} from '../../src/tasks/bgTaskRunner.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-'));

const makeSuccessExecutor = (output = 'OK'): ShellExecutor =>
  () => Promise.resolve({stdout: output, exitCode: 0});

const makeFailExecutor = (output = 'error'): ShellExecutor =>
  () => Promise.resolve({stdout: output, exitCode: 1});

describe('TaskRunner', () => {
  let tmpDir: string;
  let store: BgTaskStore;
  let runner: TaskRunner;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BgTaskStore(tmpDir);
    runner = new TaskRunner(store, {shellExecutor: makeSuccessExecutor()});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('runs shell task: queued → running → succeeded', async () => {
    const task = await store.createTask({
      title: 'Run tests',
      kind: 'shell',
      cwd: tmpDir,
      command: 'echo hello',
    });

    expect(task.status).toBe('queued');
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('OK');
  });

  it('records failed status when shell task fails', async () => {
    const failRunner = new TaskRunner(store, {shellExecutor: makeFailExecutor('boom')});
    const task = await store.createTask({
      title: 'Fail task',
      kind: 'shell',
      cwd: tmpDir,
      command: 'false',
    });

    const result = await failRunner.startTask(task.id);
    expect(result?.status).toBe('failed');
    expect(result?.errorSummary).toBeTruthy();
  });

  it('does not run already-running task again', async () => {
    const task = await store.createTask({title: 'Already running', kind: 'shell', cwd: tmpDir});
    await store.updateStatus(task.id, 'running');

    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('running'); // unchanged
  });

  it('stops a queued task', async () => {
    const task = await store.createTask({title: 'Stop me', kind: 'shell', cwd: tmpDir});
    const stopped = await runner.stopTask(task.id);
    expect(stopped?.status).toBe('stopped');
  });

  it('does not stop a terminal task', async () => {
    const task = await store.createTask({title: 'Terminal', kind: 'shell', cwd: tmpDir});
    await store.updateStatus(task.id, 'succeeded');
    const result = await runner.stopTask(task.id);
    expect(result?.status).toBe('succeeded'); // not changed
  });

  it('resumes a stopped task', async () => {
    const execCount = {count: 0};
    const countingExec: ShellExecutor = () => {
      execCount.count++;
      return Promise.resolve({stdout: 'resumed output', exitCode: 0});
    };
    const resumeRunner = new TaskRunner(store, {shellExecutor: countingExec});
    const task = await store.createTask({
      title: 'Resume me',
      kind: 'shell',
      cwd: tmpDir,
      command: 'echo hi',
    });
    await store.updateStatus(task.id, 'stopped');

    const result = await resumeRunner.resumeTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(execCount.count).toBe(1);
  });

  it('does not resume a terminal (failed) task', async () => {
    const task = await store.createTask({title: 'No resume', kind: 'shell', cwd: tmpDir});
    await store.updateStatus(task.id, 'failed');

    const result = await runner.resumeTask(task.id);
    expect(result?.status).toBe('failed'); // unchanged
  });

  it('redacts secrets from shell output', async () => {
    const secretExec: ShellExecutor = () => Promise.resolve({
      stdout: 'sk-ant-secret-token-abc123 is in output',
      exitCode: 0,
    });
    const secretRunner = new TaskRunner(store, {shellExecutor: secretExec});
    const task = await store.createTask({title: 'Secret task', kind: 'shell', cwd: tmpDir, command: 'echo secret'});
    const result = await secretRunner.startTask(task.id);
    expect(result?.outputSummary).not.toContain('sk-ant-secret-token-abc123');
  });

  it('runs workflow command task, records prompt', async () => {
    const task = await store.createTask({
      title: 'Review PR',
      kind: 'workflow',
      cwd: tmpDir,
      prompt: 'Review changes against main branch.',
      workflowCommandName: 'review-pr',
    });
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('Prompt:');
  });

  it('runs agent task placeholder, records prompt', async () => {
    const task = await store.createTask({
      title: 'Implement feature',
      kind: 'agent',
      cwd: tmpDir,
      prompt: 'Build the auth module.',
      agentName: 'code-writer',
    });
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('Agent task recorded');
  });
});

describe('formatTaskOutput', () => {
  it('formats task output without secrets', async () => {
    const tmpDir = await mkdtemp();
    const store = new BgTaskStore(tmpDir);
    const task = await store.createTask({title: 'Format test', kind: 'shell', cwd: tmpDir});
    await store.updateStatus(task.id, 'succeeded', {outputSummary: 'All done.'});
    const loaded = await store.getTask(task.id);
    const output = formatTaskOutput(loaded!);
    expect(output).toContain('Format test');
    expect(output).toContain('succeeded');
    expect(output).toContain('All done.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

import {EventBus} from '../../src/core/events/bus.js';
import type {AgentRunner} from '../../src/tasks/agentTaskRunner.js';
import type {AgentEvent} from '../../src/core/events/events.js';

describe('TaskRunner with AgentRunner', () => {
  it('runs agent task through injected runner', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-agent-'));
    const store = new BgTaskStore(tmpDir);
    const mockRunner: AgentRunner = () => Promise.resolve({success: true, outputSummary: 'Auth module complete.', toolCallCount: 4});
    const runner = new TaskRunner(store, {agentRunner: mockRunner});

    const task = await store.createTask({title: 'Build auth', kind: 'agent', cwd: tmpDir, prompt: 'Build OAuth.'});
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('succeeded');
    expect(result?.outputSummary).toContain('Auth module complete.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('records failed status when agent runner fails', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-fail-'));
    const store = new BgTaskStore(tmpDir);
    const failRunner: AgentRunner = () => Promise.resolve({success: false, outputSummary: '', errorSummary: 'Provider failed.'});
    const runner = new TaskRunner(store, {agentRunner: failRunner});

    const task = await store.createTask({title: 'Failing agent', kind: 'agent', cwd: tmpDir, prompt: 'Do stuff.'});
    const result = await runner.startTask(task.id);
    expect(result?.status).toBe('failed');
    expect(result?.errorSummary).toContain('Provider failed.');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});

describe('TaskRunner event emission', () => {
  it('emits task.started and task.completed events', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-events-'));
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const runner = new TaskRunner(store, {
      shellExecutor: () => Promise.resolve({stdout: 'ok', exitCode: 0}),
      eventBus,
    });

    const task = await store.createTask({title: 'Event test', kind: 'shell', cwd: tmpDir, command: 'echo hi'});
    await runner.startTask(task.id);

    const types = events.map((e) => e.type);
    expect(types).toContain('task.started');
    expect(types).toContain('task.completed');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('emits task.failed event on failure', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-failed-'));
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const runner = new TaskRunner(store, {
      shellExecutor: () => Promise.resolve({stdout: 'boom', exitCode: 1}),
      eventBus,
    });

    const task = await store.createTask({title: 'Fail event', kind: 'shell', cwd: tmpDir, command: 'false'});
    await runner.startTask(task.id);

    expect(events.map((e) => e.type)).toContain('task.failed');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('emits task.stopped when stopTask called', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-stopped-'));
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const runner = new TaskRunner(store, {eventBus});
    const task = await store.createTask({title: 'Stop event', kind: 'agent', cwd: tmpDir});
    await runner.stopTask(task.id);

    expect(events.map((e) => e.type)).toContain('task.stopped');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('emits task.resumed when resumeTask called', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-runner-resumed-'));
    const store = new BgTaskStore(tmpDir);
    const eventBus = new EventBus();
    const events: AgentEvent[] = [];
    eventBus.subscribe((e) => { events.push(e); });

    const runner = new TaskRunner(store, {
      shellExecutor: () => Promise.resolve({stdout: 'ok', exitCode: 0}),
      eventBus,
    });

    const task = await store.createTask({title: 'Resume event', kind: 'shell', cwd: tmpDir, command: 'echo hi'});
    await store.updateStatus(task.id, 'stopped');
    await runner.resumeTask(task.id);

    expect(events.map((e) => e.type)).toContain('task.resumed');
    await fs.rm(tmpDir, {recursive: true, force: true});
  });
});
