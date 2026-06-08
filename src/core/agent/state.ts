import type {AgentTaskState, TodoItem, ToolCallRecord} from '../../agent/types.js';

const PLAN_STEP_PATTERN = /^(?:\d+\.|[-*])\s+(.+)$/u;

const now = (): string => new Date().toISOString();

const pushUnique = (values: string[], nextValue: string | null | undefined): void => {
  if (!nextValue || values.includes(nextValue)) {
    return;
  }

  values.push(nextValue);
};

const normalizeTodoContent = (content: string): string => content.trim().replace(/\s+/gu, ' ');

export const createTaskState = (goal: string, mode: AgentTaskState['mode']): AgentTaskState => {
  const timestamp = now();
  return {
    commandsRun: [],
    errors: [],
    filesChanged: [],
    filesRead: [],
    goal,
    mode,
    plan: [],
    startedAt: timestamp,
    summary: null,
    testsRun: [],
    todos: [],
    updatedAt: timestamp,
  };
};

export const updateTaskPlan = (state: AgentTaskState, planText: string | null | undefined): TodoItem[] => {
  state.updatedAt = now();
  state.plan = [];
  state.todos = [];

  if (!planText) {
    return state.todos;
  }

  const lines = planText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(PLAN_STEP_PATTERN);
    if (!match?.[1]) {
      continue;
    }

    const content = normalizeTodoContent(match[1]);
    state.plan.push(content);
    state.todos.push({
      content,
      id: `todo-${state.todos.length + 1}`,
      status: state.todos.length === 0 ? 'running' : 'pending',
      updatedAt: now(),
    });
  }

  return state.todos;
};

export const applyTodoUpdate = (
  state: AgentTaskState,
  todos: Array<Pick<TodoItem, 'content' | 'status'> & {id?: string; note?: string}>,
): TodoItem[] => {
  state.todos = todos.map((todo, index) => ({
    content: normalizeTodoContent(todo.content),
    id: todo.id ?? `todo-${index + 1}`,
    note: todo.note,
    status: todo.status,
    updatedAt: now(),
  }));
  state.updatedAt = now();
  return state.todos;
};

export const recordToolStart = (state: AgentTaskState, toolCall: ToolCallRecord): void => {
  state.updatedAt = now();

  if (toolCall.toolName === 'read_file' && typeof toolCall.input.path === 'string') {
    pushUnique(state.filesRead, toolCall.input.path);
  }

  if (['edit_file', 'patch_file', 'write_file', 'revert_patch'].includes(toolCall.toolName) && typeof toolCall.input.path === 'string') {
    pushUnique(state.filesChanged, toolCall.input.path);
  }

  if (toolCall.toolName === 'run_command' && typeof toolCall.input.command === 'string') {
    pushUnique(state.commandsRun, toolCall.input.command);
  }

  if (toolCall.toolName === 'test_runner') {
    pushUnique(
      state.testsRun,
      typeof toolCall.input.command === 'string' ? toolCall.input.command : 'detected project tests',
    );
  }

  const runningTodo = state.todos.find((todo) => todo.status === 'running');
  if (!runningTodo) {
    const pendingTodo = state.todos.find((todo) => todo.status === 'pending');
    if (pendingTodo) {
      pendingTodo.status = 'running';
      pendingTodo.updatedAt = now();
    }
  }
};

export const recordToolCompletion = (state: AgentTaskState, toolCall: ToolCallRecord): void => {
  state.updatedAt = now();

  const resultFilePath = typeof toolCall.result?.metadata?.filePath === 'string'
    ? toolCall.result.metadata.filePath
    : null;
  if (resultFilePath && ['edit_file', 'patch_file', 'write_file', 'revert_patch'].includes(toolCall.toolName)) {
    pushUnique(state.filesChanged, resultFilePath);
  }

  if (toolCall.status === 'error') {
    pushUnique(state.errors, toolCall.error ?? `${toolCall.toolName} failed`);
    const runningTodo = state.todos.find((todo) => todo.status === 'running');
    if (runningTodo) {
      runningTodo.status = 'failed';
      runningTodo.updatedAt = now();
    }
    return;
  }

  const runningTodo = state.todos.find((todo) => todo.status === 'running');
  if (runningTodo) {
    runningTodo.status = 'completed';
    runningTodo.updatedAt = now();
  }

  const pendingTodo = state.todos.find((todo) => todo.status === 'pending');
  if (pendingTodo) {
    pendingTodo.status = 'running';
    pendingTodo.updatedAt = now();
  }
};

export const recordTaskError = (state: AgentTaskState, message: string): void => {
  pushUnique(state.errors, message);
  state.updatedAt = now();
};

export const finalizeTaskState = (state: AgentTaskState, summary: string): AgentTaskState => {
  state.summary = summary;
  state.updatedAt = now();

  for (const todo of state.todos) {
    if (todo.status === 'running') {
      todo.status = state.errors.length > 0 ? 'failed' : 'completed';
      todo.updatedAt = now();
    }
  }

  return state;
};