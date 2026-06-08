import {redactProjectBrainText} from './safety.js';

export interface ProjectTask {
  raw: string;
  done: boolean;
  text: string;
}

export interface TaskPlanSyncPreview {
  originalTasksText: string;
  updatedTasksText: string;
  planAppend: string;
  changed: boolean;
  timestamp: string;
}

export interface BgTaskFacts {
  id: string;
  title: string;
  status: 'succeeded' | 'failed' | 'stopped' | 'running' | 'queued';
  outputSummary?: string;
  errorSummary?: string;
}

const CHECKBOX_DONE_RE = /^(\s*)-\s+\[x\]\s+(.+)$/iu;
const CHECKBOX_TODO_RE = /^(\s*)-\s+\[ \]\s+(.+)$/iu;

export const parseProjectTasksMarkdown = (text: string): ProjectTask[] => {
  return text.split('\n').map((line) => {
    const done = CHECKBOX_DONE_RE.exec(line);
    if (done?.[2]) return {raw: line, done: true, text: done[2].trim()};
    const todo = CHECKBOX_TODO_RE.exec(line);
    if (todo?.[2]) return {raw: line, done: false, text: todo[2].trim()};
    return {raw: line, done: false, text: ''};
  });
};

export const updateProjectTasksFromBgTask = (tasksText: string, task: BgTaskFacts): string => {
  const lines = tasksText.split('\n');
  const titleLower = task.title.toLowerCase().slice(0, 60);
  const updated = lines.map((line) => {
    const todo = CHECKBOX_TODO_RE.exec(line);
    if (!todo?.[2]) return line;
    const taskText = todo[2].toLowerCase().slice(0, 60);
    if (!taskText.includes(titleLower) && !titleLower.includes(taskText)) return line;
    if (task.status === 'succeeded') {
      return line.replace('- [ ]', '- [x]');
    }
    return line;
  });

  const blocker = task.status === 'failed' && task.errorSummary
    ? `\n<!-- Blocker (${task.id.slice(0, 8)}): ${redactProjectBrainText(task.errorSummary.slice(0, 200))} -->`
    : '';

  return redactProjectBrainText(updated.join('\n') + blocker);
};

export const updateProjectPlanProgress = (planText: string, taskFacts: BgTaskFacts): string => {
  const section = [
    `\n\n## Recent Progress`,
    ``,
    `- **${taskFacts.title}** — ${taskFacts.status} (${new Date().toISOString().slice(0, 10)})`,
    taskFacts.outputSummary ? `  Output: ${taskFacts.outputSummary.slice(0, 200)}` : '',
    taskFacts.errorSummary ? `  Error: ${redactProjectBrainText(taskFacts.errorSummary.slice(0, 200))}` : '',
  ].filter((line) => line !== '').join('\n');

  // Append under existing Recent Progress section if present
  if (planText.includes('## Recent Progress')) {
    const idx = planText.indexOf('## Recent Progress');
    const before = planText.slice(0, idx).trimEnd();
    const after = planText.slice(idx);
    const entry = [
      `- **${taskFacts.title}** — ${taskFacts.status} (${new Date().toISOString().slice(0, 10)})`,
      taskFacts.outputSummary ? `  Output: ${taskFacts.outputSummary.slice(0, 200)}` : '',
      taskFacts.errorSummary ? `  Error: ${redactProjectBrainText(taskFacts.errorSummary.slice(0, 200))}` : '',
    ].filter(Boolean).join('\n');
    return redactProjectBrainText(`${before}\n\n${after}\n${entry}`);
  }

  return redactProjectBrainText(`${planText.trimEnd()}${section}`);
};

export const createTaskPlanSyncPreview = (
  tasksText: string,
  planText: string,
  task: BgTaskFacts,
): TaskPlanSyncPreview => {
  const timestamp = new Date().toISOString();
  const updatedTasksText = updateProjectTasksFromBgTask(tasksText, task);
  const planAppend = updateProjectPlanProgress(planText, task);
  const changed = updatedTasksText !== tasksText;
  return {originalTasksText: tasksText, updatedTasksText, planAppend, changed, timestamp};
};

export const formatTaskPlanSyncPreview = (preview: TaskPlanSyncPreview): string =>
  redactProjectBrainText([
    `Task→Plan Sync Preview — ${preview.timestamp}`,
    `Tasks changed: ${preview.changed ? 'yes' : 'no'}`,
    preview.changed
      ? `TASKS.md update preview:\n${preview.updatedTasksText.slice(0, 400)}`
      : 'TASKS.md: no checkbox matches found',
    '',
    `PLAN.md progress entry:\n${preview.planAppend.slice(0, 300)}`,
  ].join('\n'));
