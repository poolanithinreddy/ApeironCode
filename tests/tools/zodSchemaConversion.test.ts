import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {convertZodToJsonSchema, zodToJsonSchema} from '../../src/tools/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

describe('convertZodToJsonSchema (maintained library wrapper)', () => {
  it('converts primitive schemas', () => {
    expect(convertZodToJsonSchema(z.string())).toMatchObject({type: 'string'});
    expect(convertZodToJsonSchema(z.number())).toMatchObject({type: 'number'});
    expect(convertZodToJsonSchema(z.boolean())).toMatchObject({type: 'boolean'});
  });

  it('converts enum schemas to a string with enum values', () => {
    expect(convertZodToJsonSchema(z.enum(['a', 'b', 'c']))).toMatchObject({
      type: 'string',
      enum: ['a', 'b', 'c'],
    });
  });

  it('converts array schemas with item types', () => {
    expect(convertZodToJsonSchema(z.array(z.string()))).toMatchObject({
      type: 'array',
      items: {type: 'string'},
    });
  });

  it('converts object schemas with required and optional fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean().optional(),
    });
    const json = convertZodToJsonSchema(schema) as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(json.type).toBe('object');
    expect(json.properties).toMatchObject({
      name: {type: 'string'},
      age: {type: 'number'},
      active: {type: 'boolean'},
    });
    expect(json.required).toContain('name');
    expect(json.required).toContain('age');
    expect(json.required).not.toContain('active');
  });

  it('converts nested object schemas', () => {
    const schema = z.object({
      outer: z.object({inner: z.string()}),
    });
    const json = convertZodToJsonSchema(schema) as {
      properties: {outer: {type: string; properties: Record<string, unknown>}};
    };
    expect(json.properties.outer.type).toBe('object');
    expect(json.properties.outer.properties).toMatchObject({inner: {type: 'string'}});
  });

  it('surfaces properties for refined (ZodEffects) object schemas', () => {
    const schema = z
      .object({a: z.string().optional(), b: z.string().optional()})
      .refine((v) => Boolean(v.a) !== Boolean(v.b), 'exactly one');
    const json = convertZodToJsonSchema(schema) as {
      type: string;
      properties: Record<string, unknown>;
    };
    expect(json.type).toBe('object');
    expect(Object.keys(json.properties)).toEqual(['a', 'b']);
  });

  it('does not emit document-level wrapper keys', () => {
    const json = convertZodToJsonSchema(z.object({x: z.string()})) as Record<string, unknown>;
    expect(json.$schema).toBeUndefined();
    expect(json.definitions).toBeUndefined();
    expect(json.$defs).toBeUndefined();
  });

  it('keeps the backwards-compatible zodToJsonSchema alias', () => {
    expect(zodToJsonSchema).toBe(convertZodToJsonSchema);
  });

  it('does not reference Zod private `_def` internals in production conversion', () => {
    const source = readFileSync(resolve(repoRoot, 'src', 'tools', 'schema.ts'), 'utf8');
    expect(source).not.toMatch(/\._def\b/u);
    expect(source).not.toContain('_def as any');
  });
});
