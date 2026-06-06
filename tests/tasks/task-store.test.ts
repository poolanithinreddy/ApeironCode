import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createTaskState} from '../../src/core/agent/state.js';
import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {createTaskPlan, syncTaskPlanFromTodos} from '../../src/tasks/taskPlanner.js';
import {buildContinuationPrompt, formatTaskPlanList, formatTaskPlanSummary} from '../../src/tasks/taskSummary.js';
import {TaskStore} from '../../src/tasks/taskStore.js';
import {todoWriteTool} from '../../src/tools/todoWrite.js';

describe('task store', () => {
  let projectDir: string;
  let taskStore: TaskStore;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-task-'));
    taskStore = new TaskStore(projectDir);
  });

  afterEach(async () => {
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('creates, saves, and loads a task plan', async () => {
    const task = createTaskPlan({
      goal: 'Implement patch history',
      id: taskStore.createId(),
      linkedSessionId: 'session-1',
      mode: 'edit',
      planText: '1. Read files\n2. Change code',
    });

    await taskStore.save(task);
    const loaded = await taskStore.load(task.id);
    expect(loaded?.goal).toBe('Implement patch history');
    expect(loaded?.steps).toHaveLength(2);
  });

  it('updates step status from todo state', () => {
    const task = createTaskPlan({
      goal: 'Implement persistent plans',
      id: taskStore.createId(),
      mode: 'plan',
      planText: '1. Create store\n2. Wire continue',
    });

    syncTaskPlanFromTodos(task, [
      {content: 'Create store', id: 'step-1', status: 'completed', updatedAt: new Date().toISOString()},
      {content: 'Wire continue', id: 'step-2', status: 'running', updatedAt: new Date().toISOString()},
    ]);

    expect(task.steps[0]?.status).toBe('completed');
    expect(task.steps[1]?.status).toBe('running');
  });

  it('lists the latest incomplete task', async () => {
    const completed = createTaskPlan({
      goal: 'Done task',
      id: taskStore.createId(),
      mode: 'edit',
    });
    completed.status = 'completed';

    const running = createTaskPlan({
      goal: 'Running task',
      id: taskStore.createId(),
      mode: 'edit',
    });

    await taskStore.save(completed);
    await taskStore.save(running);

    const latestIncomplete = await taskStore.getLatestIncomplete();
    expect(latestIncomplete?.goal).toBe('Running task');
  });

  it('builds a continuation prompt from the task plan', () => {
    const task = createTaskPlan({
      goal: 'Continue context polish',
      id: 'task-1',
      mode: 'plan',
      planText: '1. Refresh repo map\n2. Show status',
    });
    task.steps[0]!.status = 'completed';
    const prompt = buildContinuationPrompt(task);

    expect(prompt).toContain('Continue the existing task');
    expect(prompt).toContain('Show status');
  });

  it('resolves a task by id or fallback and updates status', async () => {
    const paused = createTaskPlan({
      goal: 'Paused task',
      id: taskStore.createId(),
      mode: 'edit',
      planText: '1. Inspect code\n2. Resume work',
    });
    paused.status = 'paused';

    const completed = createTaskPlan({
      goal: 'Completed task',
      id: taskStore.createId(),
      mode: 'plan',
      planText: '1. Finish it',
    });
    completed.status = 'completed';

    await taskStore.save(completed);
    await taskStore.save(paused);

    expect(await taskStore.resolve(paused.id)).toMatchObject({id: paused.id});
    expect(await taskStore.resolve(undefined, {fallback: 'latest-incomplete'})).toMatchObject({id: paused.id});

    const updated = await taskStore.setStatus(paused.id, 'running');
    expect(updated?.status).toBe('running');
  });

  it('formats task summaries with progress details', () => {
    const task = createTaskPlan({
      goal: 'Show richer progress',
      id: 'task-1',
      mode: 'plan',
      planText: '1. Refresh repo map\n2. Show status',
    });
    task.steps[0]!.status = 'completed';

    const summary = formatTaskPlanSummary(task);
    const list = formatTaskPlanList([task]);

    expect(summary).toContain('Progress: 1/2 completed');
    expect(summary).toContain('Next step: Show status [pending]');
    expect(list).toContain('1/2 completed');
  });

  it('todoWriteTool updates the active persisted task plan', async () => {
    const task = createTaskPlan({
      goal: 'Track todos',
      id: taskStore.createId(),
      mode: 'plan',
      planText: '1. Start\n2. Finish',
    });
    await taskStore.save(task);

    const taskState = createTaskState('Track todos', 'plan');
    taskState.activeTaskPlanId = task.id;
    await todoWriteTool.run({
      todos: [
        {content: 'Start', id: 'step-1', status: 'completed'},
        {content: 'Finish', id: 'step-2', status: 'running'},
      ],
    }, {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
      taskState,
    });

    const updated = await taskStore.load(task.id);
    expect(updated?.steps[0]?.status).toBe('completed');
    expect(updated?.steps[1]?.status).toBe('running');
  });
});
