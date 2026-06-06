import {describe, expect, it} from 'vitest';

import {
  parseProjectTasksMarkdown,
  updateProjectTasksFromBgTask,
  updateProjectPlanProgress,
  createTaskPlanSyncPreview,
  formatTaskPlanSyncPreview,
} from '../../src/projectBrain/taskPlanSync.js';

const TASKS_TEXT = `# Tasks

## Active
- [ ] implement authentication
- [ ] add dashboard page
- [x] set up CI
`;

describe('Project Brain task-plan sync', () => {
  it('parses done and todo checkboxes', () => {
    const tasks = parseProjectTasksMarkdown(TASKS_TEXT);
    const done = tasks.filter((t) => t.done);
    const todo = tasks.filter((t) => !t.done && t.text);
    expect(done.length).toBe(1);
    expect(done[0]?.text).toBe('set up CI');
    expect(todo.length).toBe(2);
  });

  it('marks matching task as done on success', () => {
    const updated = updateProjectTasksFromBgTask(TASKS_TEXT, {
      id: 'task-1',
      title: 'implement authentication',
      status: 'succeeded',
    });
    expect(updated).toContain('- [x] implement authentication');
  });

  it('adds blocker comment on failure', () => {
    const updated = updateProjectTasksFromBgTask(TASKS_TEXT, {
      id: 'task-2',
      title: 'add dashboard page',
      status: 'failed',
      errorSummary: 'TypeScript compile error in dashboard.tsx',
    });
    expect(updated).toContain('Blocker');
  });

  it('preserves unrelated content', () => {
    const updated = updateProjectTasksFromBgTask(TASKS_TEXT, {
      id: 'task-3',
      title: 'set up CI',
      status: 'succeeded',
    });
    expect(updated).toContain('## Active');
    expect(updated).toContain('implement authentication');
  });

  it('appends progress to PLAN.md', () => {
    const plan = '# My App\n\n## Phase 1\n\nDo stuff.\n';
    const updated = updateProjectPlanProgress(plan, {
      id: 'task-x',
      title: 'implement auth',
      status: 'succeeded',
      outputSummary: 'JWT auth added',
    });
    expect(updated).toContain('Recent Progress');
    expect(updated).toContain('implement auth');
    expect(updated).toContain('JWT auth added');
  });

  it('redacts secrets in plan progress', () => {
    const plan = '# App\n';
    const updated = updateProjectPlanProgress(plan, {
      id: 'task-secret',
      title: 'configure secrets',
      status: 'failed',
      errorSummary: 'api_key=sk-supersecret1234567890123456',
    });
    expect(updated).not.toContain('sk-supersecret');
  });

  it('createTaskPlanSyncPreview returns changed flag', () => {
    const preview = createTaskPlanSyncPreview(TASKS_TEXT, '# Plan\n', {
      id: 'x',
      title: 'implement authentication',
      status: 'succeeded',
    });
    expect(preview.changed).toBe(true);
    expect(preview.updatedTasksText).toContain('- [x] implement authentication');
  });

  it('formatTaskPlanSyncPreview output is safe', () => {
    const preview = createTaskPlanSyncPreview(TASKS_TEXT, '# Plan\n', {
      id: 'y',
      title: 'add dashboard page',
      status: 'failed',
      errorSummary: 'error with token=ghp_secrettoken123456789012345678',
    });
    const text = formatTaskPlanSyncPreview(preview);
    expect(text).not.toContain('ghp_secret');
    expect(text).toContain('Task→Plan Sync Preview');
  });
});
