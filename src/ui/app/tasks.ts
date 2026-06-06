import type {Agent} from '../../agent/Agent.js';
import type {TaskStore} from '../../tasks/taskStore.js';
import type {TaskPlan} from '../../tasks/types.js';

export const loadActiveTask = async (
  agent: Agent,
  taskStore: TaskStore,
): Promise<TaskPlan | null> => {
  const taskPlanId = agent.currentSession.taskPlanId;
  if (!taskPlanId) {
    return null;
  }

  return taskStore.load(taskPlanId);
};
