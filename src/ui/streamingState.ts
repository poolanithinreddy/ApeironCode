import {useEffect, useRef, useState} from 'react';

import type {EventBus} from '../core/events/bus.js';
import type {AgentEvent} from '../core/events/events.js';

export interface StreamingMessageState {
  id: string;
  content: string;
  isStreaming: boolean;
  startedAt: number;
  tokenCount: number;
}

export const useStreamingMessages = (eventBus?: EventBus) => {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessageState>>(new Map());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!eventBus) {
      return;
    }

    const handleEvent = (event: AgentEvent) => {
      if (event.type === 'message.started' && event.role === 'assistant') {
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          next.set(event.messageId, {
            id: event.messageId,
            content: '',
            isStreaming: true,
            startedAt: Date.now(),
            tokenCount: 0,
          });
          return next;
        });
      } else if (event.type === 'message.delta') {
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          const state = next.get(event.messageId);
          if (state) {
            state.content += event.delta;
            state.tokenCount += 1;
          }
          return next;
        });
      } else if (event.type === 'message.completed' && event.message.role === 'assistant') {
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          const state = next.get(event.message.id);
          if (state) {
            state.isStreaming = false;
            state.content = event.message.content;
          }
          // The turn produced a completed assistant message: drop any other
          // still-streaming entries that never received content so failed
          // turns do not leave empty "ASSISTANT ▊" blocks behind.
          for (const [id, entry] of next) {
            if (id !== event.message.id && entry.isStreaming && entry.content.length === 0) {
              next.delete(id);
            }
          }
          return next;
        });
      }
    };

    unsubscribeRef.current = eventBus.subscribe(handleEvent);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [eventBus]);

  return streamingMessages;
};

export const calculateTokensPerSecond = (state: StreamingMessageState): number => {
  if (state.isStreaming) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (elapsed < 0.1) return 0;
    return state.tokenCount / elapsed;
  }

  const elapsed = (Date.now() - state.startedAt) / 1000;
  if (elapsed === 0) return 0;
  return state.tokenCount / elapsed;
};
