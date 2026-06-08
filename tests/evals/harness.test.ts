import {describe, expect, it} from 'vitest';

import {EvalMockProvider, doneChunk, toolCallChunks} from '../../src/evals/harness.js';

describe('eval harness', () => {
  it('streams scripted token chunks and done chunks', async () => {
    const provider = new EvalMockProvider(['hello', ' world', doneChunk()]);
    const chunks = [];
    for await (const chunk of provider.stream({messages: [], model: 'eval-mock'})) {
      chunks.push(chunk);
    }
    expect(chunks.map((chunk) => chunk.type)).toEqual(['token', 'token', 'done']);
    expect(chunks.map((chunk) => chunk.token ?? '').join('')).toBe('hello world');
  });

  it('streams scripted native tool-use chunks including malformed input deltas without XML directives', async () => {
    const script = [
      ...toolCallChunks('read_file', {path: 'README.md'}),
      {toolInputDelta: '{bad json', toolUseId: 'tool_bad', type: 'tool_use_delta' as const},
      doneChunk(),
    ];
    const provider = new EvalMockProvider(script);
    const serialized: string[] = [];
    for await (const chunk of provider.stream({messages: [], model: 'eval-mock'})) {
      serialized.push(JSON.stringify(chunk));
    }
    expect(serialized.join('\n')).toContain('tool_use_start');
    expect(serialized.join('\n')).not.toMatch(/<[^>]*tool/iu);
  });
});
