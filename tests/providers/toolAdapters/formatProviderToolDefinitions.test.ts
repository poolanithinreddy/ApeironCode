import {describe, expect, it} from 'vitest';

import {formatProviderToolDefinitions} from '../../../src/providers/toolAdapters/index.js';
import type {ProviderToolDefinition} from '../../../src/tools/schema.js';

const defs: ProviderToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file',
    input_schema: {type: 'object', properties: {path: {type: 'string'}}, required: ['path']},
  },
];

describe('formatProviderToolDefinitions', () => {
  it('produces Anthropic-shaped tool entries with name + input_schema', () => {
    const out = formatProviderToolDefinitions('anthropic', defs);
    expect(out).toHaveLength(1);
    const entry = out[0] as {name: string; description: string; input_schema: {type: string}};
    expect(entry.name).toBe('read_file');
    expect(entry.input_schema.type).toBe('object');
  });

  it('produces OpenAI-shaped function wrappers', () => {
    const out = formatProviderToolDefinitions('openai', defs);
    const entry = out[0] as {type: string; function: {name: string; parameters: {type: string}}};
    expect(entry.type).toBe('function');
    expect(entry.function.name).toBe('read_file');
    expect(entry.function.parameters.type).toBe('object');
  });

  it('routes openai-compatible providers (azure, openrouter) through openai shape', () => {
    for (const provider of ['azure', 'openrouter', 'deepseek', 'groq']) {
      const out = formatProviderToolDefinitions(provider, defs);
      const entry = out[0] as {type?: string};
      expect(entry.type).toBe('function');
    }
  });

  it('falls back to Anthropic shape for unknown providers', () => {
    const out = formatProviderToolDefinitions('unknown-provider', defs);
    const entry = out[0] as {name?: string; type?: string};
    expect(entry.name).toBe('read_file');
    expect(entry.type).toBeUndefined();
  });
});
