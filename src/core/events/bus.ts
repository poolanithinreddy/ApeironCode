import type {AgentEvent} from './events.js';

export type AgentEventListener = (event: AgentEvent) => void | Promise<void>;

export class EventBus {
  private readonly history: AgentEvent[] = [];
  private readonly listeners = new Set<AgentEventListener>();

  emit(event: AgentEvent): void {
    this.history.push(event);

    for (const listener of this.listeners) {
      void listener(event);
    }
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): AgentEvent[] {
    return [...this.history];
  }
}