import {describe, expect, it} from 'vitest';

import {minifyToolSchema} from '../../src/tools/schemaMinifier.js';
import type {ProviderToolDefinition} from '../../src/tools/schema.js';

const baseDef = (name: string, propsExtra: Record<string, unknown> = {}): ProviderToolDefinition => ({
  name,
  description: `Do ${name}`,
  input_schema: {
    type: 'object',
    properties: {
      path: {type: 'string', description: 'short'},
      mode: {type: 'string', enum: ['r', 'w'], description: 'this is a longer description than twenty chars'},
      ...propsExtra,
    },
    required: ['path'],
  },
});

describe('minifyToolSchema', () => {
  it('preserves required fields', () => {
    const r = minifyToolSchema(baseDef('grep'));
    const schema = r.minified.input_schema as unknown as {required: string[]};
    expect(schema.required).toEqual(['path']);
  });

  it('preserves enum values', () => {
    const r = minifyToolSchema(baseDef('grep'));
    const schema = r.minified.input_schema as unknown as {properties: Record<string, {enum?: unknown[]}>};
    expect(schema.properties.mode?.enum).toEqual(['r', 'w']);
  });

  it('removes short descriptions for non-risky tools', () => {
    const r = minifyToolSchema(baseDef('grep'));
    const schema = r.minified.input_schema as unknown as {properties: Record<string, {description?: string}>};
    expect(schema.properties.path?.description).toBeUndefined();
    expect(schema.properties.mode?.description).toBeDefined();
  });

  it('preserves all descriptions for risky tools', () => {
    const r = minifyToolSchema(baseDef('edit_file'));
    const schema = r.minified.input_schema as unknown as {properties: Record<string, {description?: string}>};
    expect(schema.properties.path?.description).toBe('short');
  });

  it('produces stable alphabetical ordering', () => {
    const r = minifyToolSchema(baseDef('grep', {alpha: {type: 'string'}, zebra: {type: 'string'}}));
    const schema = r.minified.input_schema as unknown as {properties: Record<string, unknown>};
    expect(Object.keys(schema.properties)).toEqual(['alpha', 'mode', 'path', 'zebra']);
  });

  it('reports tokensSaved > 0 when descriptions removed', () => {
    const r = minifyToolSchema(baseDef('grep'));
    expect(r.tokensSaved).toBeGreaterThanOrEqual(0);
    expect(r.charsRemoved).toBeGreaterThan(0);
  });

  it('preserves descriptions for anthropic minification', () => {
    const r = minifyToolSchema(baseDef('grep'), {providerId: 'anthropic'});
    const schema = r.minified.input_schema as unknown as {properties: Record<string, {description?: string}>};
    expect(schema.properties.path?.description).toBe('short');
  });

  it('keeps minified schema valid with name/description/type', () => {
    const r = minifyToolSchema(baseDef('grep'));
    expect(r.minified.name).toBe('grep');
    expect(r.minified.description).toBe('Do grep');
    const schema = r.minified.input_schema as unknown as {type: string};
    expect(schema.type).toBe('object');
  });
});
