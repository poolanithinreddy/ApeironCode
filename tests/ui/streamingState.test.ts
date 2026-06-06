import {describe, expect, it} from 'vitest';

import {EventBus} from '../../src/core/events/bus.js';
import {calculateTokensPerSecond} from '../../src/ui/streamingState.js';

// Note: Testing React hooks outside of a React environment is not ideal.
// This test demonstrates the underlying logic. For full integration testing,
// use React Testing Library or similar.

describe('streamingState', () => {
  it('calculateTokensPerSecond works correctly', () => {
    const state = {
      id: 'msg-1',
      content: 'hello world',
      isStreaming: false,
      startedAt: Date.now() - 2000, // 2 seconds ago
      tokenCount: 20,
    };

    const tokensPerSec = calculateTokensPerSecond(state);
    expect(tokensPerSec).toBeGreaterThan(5);
    expect(tokensPerSec).toBeLessThan(15);
  });

  it('calculateTokensPerSecond returns 0 for very short durations', () => {
    const state = {
      id: 'msg-1',
      content: 'hi',
      isStreaming: true,
      startedAt: Date.now(),
      tokenCount: 2,
    };

    const tokensPerSec = calculateTokensPerSecond(state);
    expect(tokensPerSec).toBe(0);
  });

  it('EventBus can emit and subscribe to events', () => {
    const eventBus = new EventBus();
    const events: unknown[] = [];

    const unsubscribe = eventBus.subscribe((event) => {
      events.push(event);
    });

    eventBus.emit({
      messageId: 'msg-1',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      type: 'message.started',
    });

    eventBus.emit({
      delta: 'hello',
      messageId: 'msg-1',
      timestamp: new Date().toISOString(),
      type: 'message.delta',
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'message.started',
        messageId: 'msg-1',
      })
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        type: 'message.delta',
        delta: 'hello',
      })
    );

    unsubscribe();

    eventBus.emit({
      delta: 'world',
      messageId: 'msg-1',
      timestamp: new Date().toISOString(),
      type: 'message.delta',
    });

    // Should still be 2 because we unsubscribed
    expect(events).toHaveLength(2);
  });
});
