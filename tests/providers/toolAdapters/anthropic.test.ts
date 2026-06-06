import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {AnthropicToolAdapter} from '../../../src/providers/toolAdapters/anthropic.js';
import type {ToolSchema} from '../../../src/tools/schema.js';
import type {NormalizedToolUse} from '../../../src/providers/toolAdapters/types.js';

const sampleSchema: ToolSchema = {
  name: 'read_file',
  description: 'Read a file',
  category: 'file',
  inputSchema: z.object({path: z.string()}),
  execute: () => Promise.resolve({ok: true, summary: '', output: ''}),
};

describe('AnthropicToolAdapter', () => {
  const adapter = new AnthropicToolAdapter();

  it('formatToolDefinitions produces input_schema with type object', () => {
    const result = adapter.formatToolDefinitions([sampleSchema]);
    expect(result.definitions).toHaveLength(1);
    const def = result.definitions[0] as {name: string; input_schema: {type: string; properties: Record<string, unknown>; required: string[]}};
    expect(def.name).toBe('read_file');
    expect(def.input_schema.type).toBe('object');
    expect(def.input_schema.properties).toHaveProperty('path');
    expect(def.input_schema.required).toContain('path');
  });

  it('parseToolUses finds tool_use content blocks', () => {
    const chunk = {
      content: [
        {type: 'text', text: 'hi'},
        {type: 'tool_use', id: 'tu_1', name: 'read_file', input: {path: 'a.ts'}},
      ],
    };
    const result = adapter.parseToolUses(chunk);
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]?.name).toBe('read_file');
    expect(result.toolUses[0]?.inputJson).toBe(JSON.stringify({path: 'a.ts'}));
  });

  it('parseToolUses handles content_block_start streaming events', () => {
    const chunk = {type: 'content_block_start', content_block: {type: 'tool_use', id: 't1', name: 'edit_file'}};
    const result = adapter.parseToolUses(chunk);
    expect(result.toolUses[0]?.id).toBe('t1');
  });

  it('applyDelta accumulates inputJson', () => {
    const acc = new Map<string, NormalizedToolUse>();
    adapter.applyDelta(acc, {id: 'a', name: 'read_file', inputDelta: '{"pa'});
    adapter.applyDelta(acc, {id: 'a', inputDelta: 'th":"x.ts"}'});
    expect(acc.get('a')?.inputJson).toBe('{"path":"x.ts"}');
    expect(acc.get('a')?.name).toBe('read_file');
  });
});
