import {describe, expect, it} from 'vitest';

import {MockProvider} from '../../src/providers/mock.js';

describe('MockProvider', () => {
  it('returns OK for connectivity checks', async () => {
    const provider = new MockProvider();
    let message = '';

    for await (const chunk of provider.stream({
      messages: [{content: 'Reply with OK', role: 'user'}],
      model: 'mock-coder',
    })) {
      if (chunk.type === 'token') {
        message += chunk.token ?? '';
      }
    }

    expect(message.trim()).toBe('OK');
  });

  it('emits tool-call blocks for explain repo prompts', async () => {
    const provider = new MockProvider();
    const toolCalls: Array<{name: string; input: string}> = [];

    for await (const chunk of provider.stream({
      messages: [{content: 'Explain this repo', role: 'user'}],
      model: 'mock-coder',
    })) {
      if (chunk.type === 'token') {
        // do nothing, message is not needed for this test
      } else if (chunk.type === 'tool_use_start') {
        toolCalls.push({name: chunk.toolName ?? '', input: ''});
      } else if (chunk.type === 'tool_use_delta' && toolCalls.length > 0) {
        const last = toolCalls[toolCalls.length - 1];
        if (last) {
          last.input += chunk.toolInputDelta ?? '';
        }
      }
    }

    expect(toolCalls.some((tc) => tc.name === 'package_info')).toBe(true);
  });
});