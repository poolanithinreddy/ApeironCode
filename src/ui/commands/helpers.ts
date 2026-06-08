import type {TaskStore} from '../../tasks/taskStore.js';
import type {TaskPlan} from '../../tasks/types.js';

export const resolveSlashTask = async (
  taskStore: TaskStore,
  taskId?: string,
  fallback: 'latest' | 'latest-incomplete' | 'latest-incomplete-or-latest' = 'latest-incomplete-or-latest',
): Promise<TaskPlan | null> => {
  return taskStore.resolve(taskId, {fallback});
};

export const formatSlashMissingTaskMessage = (taskId?: string, incompleteOnly = false): string => {
  if (taskId) {
    return `No task plan found for ${taskId}.`;
  }

  return incompleteOnly ? 'No incomplete task plan found.' : 'No persisted task plans found.';
};
