import {z} from 'zod';

import {applyTodoUpdate} from '../core/agent/state.js';
import {createEventTimestamp} from '../core/events/events.js';
import {syncTaskPlanFromTodos} from '../tasks/taskPlanner.js';
import {TaskStore} from '../tasks/taskStore.js';
import {AppError} from '../utils/errors.js';
import {defineTool} from './types.js';

const TodoWriteInputSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string().min(1),
      id: z.string().optional(),
      note: z.string().optional(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
    }),
  ).min(1),
});

export const todoWriteTool = defineTool({
  description: 'Update the agent todo state so the runtime and TUI can reflect execution progress.',
  inputSchema: TodoWriteInputSchema,
  name: 'todo_write',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    if (!context.taskState) {
      throw new AppError('Todo state is not available in the current runtime.', 'TODO_STATE_UNAVAILABLE');
    }

    const input = TodoWriteInputSchema.parse(rawInput);
    const todos = applyTodoUpdate(context.taskState, input.todos);
    if (context.taskState.activeTaskPlanId) {
      const taskStore = new TaskStore(context.cwd);
      await taskStore.update(context.taskState.activeTaskPlanId, (task) => {
        return syncTaskPlanFromTodos(task, todos);
      });
    }
    context.eventBus?.emit({
      timestamp: createEventTimestamp(),
      todos,
      type: 'todo.updated',
    });

    return {
      metadata: {todos},
      ok: true,
      output: JSON.stringify(todos, null, 2),
      summary: `Updated ${todos.length} todo item(s)`,
    };
  },
});