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

  it('repairs the documented no-key failing-test fixture after reading it', async () => {
    const provider = new MockProvider();
    const messages = [
      {
        content: [
          'fix the failing test',
          'Likely affected files: src/math.js, test/math.test.js',
          'Failing tests: allows the maximum score',
        ].join('\n'),
        role: 'user' as const,
      },
      {
        content: 'Tool result for read_file:\n\nexport const clampScore = (score) => Math.min(99, Math.max(0, score));',
        role: 'user' as const,
      },
    ];

    const chunks = [];
    for await (const chunk of provider.stream({
      messages,
      model: 'mock-coder',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual(expect.objectContaining({
      toolName: 'edit_file',
      type: 'tool_use_start',
    }));
    expect(chunks).toContainEqual(expect.objectContaining({
      toolInputDelta: JSON.stringify({
        path: 'src/math.js',
        replace: 'Math.min(100',
        search: 'Math.min(99',
      }),
      type: 'tool_use_delta',
    }));
  });

  it('does not treat test durations as explicit file paths', async () => {
    const provider = new MockProvider();
    const chunks = [];

    for await (const chunk of provider.stream({
      messages: [{
        content: 'fix the failing test\nFailing tests: allows the maximum score (0.948667ms)',
        role: 'user',
      }],
      model: 'mock-coder',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual(expect.objectContaining({
      toolName: 'read_file',
    }));
    expect(chunks).toContainEqual(expect.objectContaining({
      toolName: 'test_runner',
    }));
  });

  it('stops after applying the documented test fix', async () => {
    const provider = new MockProvider();
    const chunks = [];

    for await (const chunk of provider.stream({
      messages: [
        {
          content: 'fix the failing test\nLikely affected files: src/math.js, test/math.test.js',
          role: 'user',
        },
        {
          content: 'Tool result for edit_file:\n\nEdited src/math.js',
          role: 'user',
        },
      ],
      model: 'mock-coder',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual(expect.objectContaining({
      type: 'tool_use_start',
    }));
    expect(chunks.some((chunk) => (
      chunk.type === 'token' && chunk.token?.includes('Execution')
    ))).toBe(true);
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
