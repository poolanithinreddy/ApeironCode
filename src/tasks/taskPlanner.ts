import type {AgentMode, AgentTaskState, TodoItem, ToolCallRecord} from '../agent/types.js';
import type {TaskPlan, TaskPlanStatus, TaskStep, TaskStepStatus} from './types.js';
import type {TaskStore} from './taskStore.js';

const CODING_PROMPT_PATTERN = /fix|debug|implement|refactor|review|test|patch|edit|continue|build|lint|context|doctor/u;

const now = (): string => new Date().toISOString();

const uniquePush = (items: string[], value: string | null | undefined): void => {
  if (!value || items.includes(value)) {
    return;
  }

  items.push(value);
};

const parsePlanSteps = (planText: string | null | undefined): TaskStep[] => {
  const lines = (planText ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(?:\d+\.|[-*])\s+/u.test(line));

  if (lines.length === 0) {
    return [
      {files: [], id: 'step-1', status: 'running', title: 'Inspect relevant files', tools: []},
      {files: [], id: 'step-2', status: 'pending', title: 'Apply the necessary change', tools: []},
      {files: [], id: 'step-3', status: 'pending', title: 'Validate the result', tools: []},
    ];
  }

  return lines.map((line, index) => ({
    files: [],
    id: `step-${index + 1}`,
    status: index === 0 ? 'running' : 'pending',
    title: line.replace(/^(?:\d+\.|[-*])\s+/u, ''),
    tools: [],
  }));
};

const mapTodoStatus = (status: TodoItem['status']): TaskStepStatus => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
};

const inferTaskStatus = (steps: TaskStep[], fallback: TaskPlanStatus = 'running'): TaskPlanStatus => {
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.length > 0 && steps.every((step) => step.status === 'completed' || step.status === 'skipped')) {
    return 'completed';
  }
  if (steps.some((step) => step.status === 'running')) {
    return 'running';
  }
  return fallback;
};

export const shouldPersistTask = (goal: string, mode: AgentMode): boolean => {
  if (mode !== 'chat') {
    return true;
  }

  return goal.trim().split(/\s+/u).length >= 6 || CODING_PROMPT_PATTERN.test(goal);
};

export const createTaskPlan = ({
  goal,
  id,
  linkedSessionId,
  mode,
  planText,
}: {
  goal: string;
  id: string;
  linkedSessionId?: string;
  mode: AgentMode;
  planText?: string | null;
}): TaskPlan => {
  const timestamp = now();
  return {
    commandsRun: [],
    createdAt: timestamp,
    filesChanged: [],
    filesInspected: [],
    goal,
    id,
    linkedSessionId,
    memorySuggestions: [],
    mode,
    permissionDecisions: [],
    status: 'running',
    steps: parsePlanSteps(planText),
    testsRun: [],
    updatedAt: timestamp,
  };
};

export const syncTaskPlanFromTodos = (task: TaskPlan, todos: TodoItem[]): TaskPlan => {
  task.steps = todos.map((todo) => ({
    completedAt: todo.status === 'completed' ? todo.updatedAt : undefined,
    description: todo.note,
    files: task.steps.find((step) => step.id === todo.id)?.files ?? [],
    id: todo.id,
    startedAt: task.steps.find((step) => step.id === todo.id)?.startedAt ?? (todo.status === 'running' ? todo.updatedAt : undefined),
    status: mapTodoStatus(todo.status),
    title: todo.content,
    tools: task.steps.find((step) => step.id === todo.id)?.tools ?? [],
  }));
  task.status = inferTaskStatus(task.steps);
  task.updatedAt = now();
  return task;
};

export const syncTaskPlanFromTaskState = (task: TaskPlan, taskState: AgentTaskState | undefined): TaskPlan => {
  if (!taskState) {
    return task;
  }

  for (const file of taskState.filesRead) {
    uniquePush(task.filesInspected, file);
  }
  for (const file of taskState.filesChanged) {
    uniquePush(task.filesChanged, file);
  }
  for (const command of taskState.commandsRun) {
    uniquePush(task.commandsRun, command);
  }
  for (const test of taskState.testsRun) {
    uniquePush(task.testsRun, test);
  }

  if (taskState.todos.length > 0) {
    syncTaskPlanFromTodos(task, taskState.todos);
  }

  task.updatedAt = now();
  return task;
};

export const syncTaskPlanFromToolCall = (task: TaskPlan, toolCall: ToolCallRecord): TaskPlan => {
  const activeStep = task.steps.find((step) => step.status === 'running') ?? task.steps[0];
  if (activeStep) {
    uniquePush(activeStep.tools, toolCall.toolName);
    if (typeof toolCall.input.path === 'string') {
      uniquePush(activeStep.files, toolCall.input.path);
    }
    if (!activeStep.startedAt) {
      activeStep.startedAt = toolCall.createdAt;
    }
    if (toolCall.status === 'success') {
      activeStep.result = toolCall.result?.summary;
    }
    if (toolCall.status === 'error') {
      activeStep.error = toolCall.error;
    }
  }

  if (typeof toolCall.input.path === 'string') {
    uniquePush(task.filesInspected, toolCall.input.path);
    if (['edit_file', 'patch_file', 'write_file', 'revert_patch'].includes(toolCall.toolName)) {
      uniquePush(task.filesChanged, toolCall.input.path);
    }
  }

  if (toolCall.toolName === 'run_command' && typeof toolCall.input.command === 'string') {
    uniquePush(task.commandsRun, toolCall.input.command);
  }

  if (toolCall.toolName === 'test_runner') {
    uniquePush(task.testsRun, typeof toolCall.input.command === 'string' ? toolCall.input.command : 'detected project tests');
  }

  task.updatedAt = now();
  return task;
};

export class TaskTracker {
  constructor(
    private readonly store: TaskStore,
    private task: TaskPlan,
  ) {}

  get current(): TaskPlan {
    return this.task;
  }

  async persist(): Promise<void> {
    await this.store.save(this.task);
  }

  async syncFromTaskState(taskState?: AgentTaskState): Promise<void> {
    syncTaskPlanFromTaskState(this.task, taskState);
    await this.persist();
  }

  async syncFromTodos(todos: TodoItem[]): Promise<void> {
    syncTaskPlanFromTodos(this.task, todos);
    await this.persist();
  }

  async recordToolCall(toolCall: ToolCallRecord, taskState?: AgentTaskState): Promise<void> {
    syncTaskPlanFromToolCall(this.task, toolCall);
    syncTaskPlanFromTaskState(this.task, taskState);
    await this.persist();
  }

  async recordPermissionDecision(decision: string): Promise<void> {
    uniquePush(this.task.permissionDecisions, decision);
    await this.persist();
  }

  async recordMemorySuggestion(summary: string): Promise<void> {
    uniquePush(this.task.memorySuggestions, summary);
    await this.persist();
  }

  async complete(finalSummary: string, status: Extract<TaskPlanStatus, 'completed' | 'failed' | 'paused'>): Promise<void> {
    this.task.finalSummary = finalSummary;
    this.task.status = status;
    if (status === 'completed') {
      for (const step of this.task.steps) {
        if (step.status === 'running') {
          step.status = 'completed';
          step.completedAt = now();
        }
      }
    }
    await this.persist();
  }
}
