import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {GenericToolAdapter} from '../../../src/providers/toolAdapters/generic.js';
import {getToolAdapter} from '../../../src/providers/toolAdapters/index.js';
import type {ToolSchema} from '../../../src/tools/schema.js';

const sampleSchema: ToolSchema = {
  name: 'read_file',
  description: 'Read a file',
  category: 'file',
  inputSchema: z.object({path: z.string()}),
  execute: () => Promise.resolve({ok: true, summary: '', output: ''}),
};

describe('GenericToolAdapter', () => {
  it('falls back to OpenAI parsing first', () => {
    const adapter = new GenericToolAdapter();
    const chunk = {choices: [{message: {tool_calls: [{id: 'c1', function: {name: 'read_file', arguments: '{}'}}]}}]};
    expect(adapter.parseToolUses(chunk).toolUses).toHaveLength(1);
  });

  it('falls back to Anthropic parsing if no openai matches', () => {
    const adapter = new GenericToolAdapter();
    const chunk = {content: [{type: 'tool_use', id: 't1', name: 'read_file', input: {}}]};
    expect(adapter.parseToolUses(chunk).toolUses).toHaveLength(1);
  });

  it('returns empty with warning for unknown chunk format', () => {
    const adapter = new GenericToolAdapter();
    const result = adapter.parseToolUses({foo: 'bar'});
    expect(result.toolUses).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('formatToolDefinitions delegates to OpenAI format', () => {
    const adapter = new GenericToolAdapter();
    const result = adapter.formatToolDefinitions([sampleSchema]);
    const def = result.definitions[0] as {type: string};
    expect(def.type).toBe('function');
  });
});

describe('getToolAdapter', () => {
  it('returns AnthropicToolAdapter for anthropic', () => {
    expect(getToolAdapter('anthropic').providerId).toBe('anthropic');
  });
  it('returns OpenAIToolAdapter for openai/openrouter', () => {
    expect(getToolAdapter('openai').providerId).toBe('openai');
    expect(getToolAdapter('openrouter').providerId).toBe('openai');
  });
  it('returns GeminiToolAdapter for gemini', () => {
    expect(getToolAdapter('gemini').providerId).toBe('gemini');
  });
  it('returns GenericToolAdapter for unknown provider', () => {
    expect(getToolAdapter('unknown-provider-xyz').providerId).toBe('generic');
  });
});
