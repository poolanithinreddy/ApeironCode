import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ProviderMessage} from '../providers/types.js';
import type {AgentTaskState, ChatMessage} from './types.js';

export const MAX_CONFIGURABLE_ITERATIONS = 200;
export const CHECKPOINTED_TOOLS = new Set(['edit_file', 'patch_file', 'write_file', 'revert_patch']);
export const VERIFY_TOOLS = new Set(['test_runner', 'lint_runner', 'build_runner']);

export const toProviderMessages = (
  messages: ChatMessage[],
  systemPrompt: string,
): ProviderMessage[] => {
  const providerMessages: ProviderMessage[] = [{content: systemPrompt, role: 'system'}];
  for (const message of messages) {
    providerMessages.push({
      content: message.content,
      role: message.role === 'tool' ? 'user' : message.role,
    });
  }
  return providerMessages;
};

export const emitMessage = (eventBus: EventBus | undefined, message: ChatMessage): void => {
  if (!eventBus) return;
  eventBus.emit({
    messageId: message.id,
    role: message.role,
    timestamp: createEventTimestamp(),
    type: 'message.started',
  });
  eventBus.emit({
    message,
    timestamp: createEventTimestamp(),
    type: 'message.completed',
  });
};

export const emitTodoUpdate = (eventBus: EventBus | undefined, taskState?: AgentTaskState): void => {
  if (!eventBus || !taskState) return;
  eventBus.emit({
    timestamp: createEventTimestamp(),
    todos: [...taskState.todos],
    type: 'todo.updated',
  });
};
