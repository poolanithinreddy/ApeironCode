import type {EventBus} from '../core/events/bus.js';
import type {AgentCallbacks} from './types.js';

export const bindAgentCallbacks = (eventBus: EventBus, callbacks?: AgentCallbacks): () => void => {
  if (!callbacks) {
    return () => {};
  }

  return eventBus.subscribe((event) => {
    switch (event.type) {
      case 'approval.completed':
        callbacks.onApprovalResolved?.(event.approved);
        break;
      case 'approval.requested':
        callbacks.onApprovalRequest?.(event.request);
        break;
      case 'message.completed':
        callbacks.onMessage?.(event.message);
        break;
      case 'status.updated':
        callbacks.onStatus?.(event.message);
        break;
      case 'tool.completed':
      case 'tool.failed':
        callbacks.onToolResult?.(event.toolCall);
        break;
      case 'tool.output':
        if (event.outputKind === 'status') {
          callbacks.onStatus?.(event.message);
        }
        break;
      case 'tool.started':
        callbacks.onToolCall?.(event.toolCall);
        break;
      default:
        break;
    }
  });
};
