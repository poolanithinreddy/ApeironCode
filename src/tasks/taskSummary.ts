import type {TaskContinuationContext, TaskPlan} from './types.js';

const formatList = (items: string[], emptyLabel: string): string => {
  return items.length > 0 ? items.join(', ') : emptyLabel;
};

const getTaskProgress = (task: TaskPlan): string => {
  if (task.steps.length === 0) {
    return '0/0 completed';
  }

  const completedSteps = task.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length;
  return `${completedSteps}/${task.steps.length} completed`;
};

const getNextTaskStep = (task: TaskPlan): string => {
  const nextStep = task.steps.find(
    (step) => step.status === 'running' || step.status === 'pending' || step.status === 'failed',
  );
  return nextStep ? `${nextStep.title} [${nextStep.status}]` : 'none';
};

export const getTaskContinuationContext = (task: TaskPlan): TaskContinuationContext => {
  return {
    completedSteps: task.steps.filter((step) => step.status === 'completed' || step.status === 'skipped'),
    nextSteps: task.steps.filter((step) => step.status === 'pending' || step.status === 'failed' || step.status === 'running'),
    task,
  };
};

export const formatTaskPlanSummary = (task: TaskPlan): string => {
  return [
    `Task ${task.id}`,
    `Goal: ${task.goal}`,
    `Status: ${task.status}`,
    `Mode: ${task.mode}`,
    `Progress: ${getTaskProgress(task)}`,
    `Updated: ${task.updatedAt}`,
    `Linked session: ${task.linkedSessionId ?? 'none'}`,
    `Next step: ${getNextTaskStep(task)}`,
    'Steps:',
    ...(task.steps.length > 0
      ? task.steps.map((step) => `- [${step.status}] ${step.title}`)
      : ['- none']),
    `Files inspected: ${formatList(task.filesInspected, 'none')}`,
    `Files changed: ${formatList(task.filesChanged, 'none')}`,
    `Commands run: ${formatList(task.commandsRun, 'none')}`,
    `Tests run: ${formatList(task.testsRun, 'none')}`,
  ].join('\n');
};

export const formatTaskPlanList = (tasks: TaskPlan[]): string => {
  if (tasks.length === 0) {
    return 'No persisted task plans found.';
  }

  return tasks
    .map((task) => `${task.id} | ${task.status} | ${getTaskProgress(task)} | ${task.mode} | ${task.goal}`)
    .join('\n');
};

export const buildContinuationPrompt = (task: TaskPlan): string => {
  const continuation = getTaskContinuationContext(task);
  return [
    'Continue the existing task from the saved project plan.',
    `Task ID: ${task.id}`,
    `Goal: ${task.goal}`,
    `Mode: ${task.mode}`,
    `Status: ${task.status}`,
    `Completed steps: ${continuation.completedSteps.length > 0 ? continuation.completedSteps.map((step) => step.title).join(', ') : 'none'}`,
    `Next steps: ${continuation.nextSteps.length > 0 ? continuation.nextSteps.map((step) => `${step.title} [${step.status}]`).join(', ') : 'none'}`,
    `Files already inspected: ${formatList(task.filesInspected, 'none')}`,
    `Files already changed: ${formatList(task.filesChanged, 'none')}`,
    `Commands already run: ${formatList(task.commandsRun, 'none')}`,
    `Tests already run: ${formatList(task.testsRun, 'none')}`,
    `Permission decisions: ${formatList(task.permissionDecisions, 'none')}`,
    `Memory suggestions: ${formatList(task.memorySuggestions, 'none')}`,
    task.finalSummary ? `Previous final summary: ${task.finalSummary}` : 'Previous final summary: none',
    'Do not repeat completed work unless it is necessary. Start from the next pending or failed step and validate the result.',
  ].join('\n');
};
