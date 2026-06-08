import type {AgentMode, AgentTaskState, TodoItem, ToolCallRecord} from '../agent/types.js';

export type TaskPlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';
export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskStep {
  id: string;
  title: string;
  status: TaskStepStatus;
  description?: string;
  files: string[];
  tools: string[];
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskPlan {
  id: string;
  goal: string;
  status: TaskPlanStatus;
  mode: AgentMode;
  createdAt: string;
  updatedAt: string;
  linkedSessionId?: string;
  steps: TaskStep[];
  filesInspected: string[];
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  permissionDecisions: string[];
  memorySuggestions: string[];
  finalSummary?: string;
}

export interface TaskContinuationContext {
  task: TaskPlan;
  nextSteps: TaskStep[];
  completedSteps: TaskStep[];
}

export interface TaskTrackerEventContext {
  taskState?: AgentTaskState;
  toolCall?: ToolCallRecord;
  todos?: TodoItem[];
}
