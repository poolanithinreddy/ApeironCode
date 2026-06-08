import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {OpenAIToolAdapter} from '../../../src/providers/toolAdapters/openai.js';
import type {ToolSchema} from '../../../src/tools/schema.js';
import type {NormalizedToolUse} from '../../../src/providers/toolAdapters/types.js';

const sampleSchema: ToolSchema = {
  name: 'grep_search',
  description: 'Search files',
  category: 'file',
  inputSchema: z.object({pattern: z.string()}),
  execute: () => Promise.resolve({ok: true, summary: '', output: ''}),
};

describe('OpenAIToolAdapter', () => {
  const adapter = new OpenAIToolAdapter();

  it('formatToolDefinitions produces function type', () => {
    const result = adapter.formatToolDefinitions([sampleSchema]);
    const def = result.definitions[0] as {type: string; function: {name: string; parameters: {type: string}}};
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('grep_search');
    expect(def.function.parameters.type).toBe('object');
  });

  it('parseToolUses finds tool_calls in message', () => {
    const chunk = {
      choices: [{message: {tool_calls: [{id: 'c1', function: {name: 'grep_search', arguments: '{"pattern":"x"}'}}]}}],
    };
    const result = adapter.parseToolUses(chunk);
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]?.inputJson).toBe('{"pattern":"x"}');
  });

  it('applyDelta accumulates arguments', () => {
    const acc = new Map<string, NormalizedToolUse>();
    adapter.applyDelta(acc, {id: 'c1', name: 'grep_search', inputDelta: '{"pat'});
    adapter.applyDelta(acc, {id: 'c1', inputDelta: 'tern":"x"}'});
    expect(acc.get('c1')?.inputJson).toBe('{"pattern":"x"}');
  });
});
