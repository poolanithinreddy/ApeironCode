import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {GeminiToolAdapter} from '../../../src/providers/toolAdapters/gemini.js';
import type {ToolSchema} from '../../../src/tools/schema.js';

const sampleSchema: ToolSchema = {
  name: 'read_file',
  description: 'Read a file',
  category: 'file',
  inputSchema: z.object({path: z.string()}),
  execute: () => Promise.resolve({ok: true, summary: '', output: ''}),
};

describe('GeminiToolAdapter', () => {
  const adapter = new GeminiToolAdapter();

  it('formatToolDefinitions produces functionDeclarations', () => {
    const result = adapter.formatToolDefinitions([sampleSchema]);
    const def = result.definitions[0] as {functionDeclarations: Array<{name: string; parameters: {type: string}}>};
    expect(def.functionDeclarations).toHaveLength(1);
    expect(def.functionDeclarations[0]?.name).toBe('read_file');
    expect(def.functionDeclarations[0]?.parameters.type).toBe('object');
  });

  it('parseToolUses finds functionCall parts', () => {
    const chunk = {
      candidates: [{content: {parts: [{functionCall: {name: 'read_file', args: {path: 'a.ts'}}}]}}],
    };
    const result = adapter.parseToolUses(chunk);
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]?.name).toBe('read_file');
    expect(JSON.parse(result.toolUses[0]!.inputJson)).toEqual({path: 'a.ts'});
  });
});
