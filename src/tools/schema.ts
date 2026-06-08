import type {ZodTypeAny} from 'zod';
import type {JSONSchema7} from 'json-schema';
import {zodToJsonSchema as zodToJsonSchemaLib} from 'zod-to-json-schema';
import type {ToolResult} from './types.js';
import type {ToolExecutionContext} from './types.js';

export interface ProviderToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema7;
}

export interface ToolSchema<TInput = unknown> {
  name: string;
  description: string;
  category: 'file' | 'command' | 'web' | 'git' | 'test' | 'other';
  inputSchema: ZodTypeAny;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolResult>;
}

/**
 * Convert a Zod schema to JSON Schema 7 (compatible with Anthropic, OpenAI, Ollama).
 *
 * This delegates to the maintained `zod-to-json-schema` library instead of
 * reading Zod's unstable private `_def` internals. We inline all `$ref`s and
 * strip the document-level wrapper keys (`$schema`, `definitions`, `$defs`) so
 * the output stays a flat, provider-friendly tool input schema. Provider-specific
 * sanitization (see `toolSchemaSanitizer.ts`) remains a separate concern.
 */
export function convertZodToJsonSchema(schema: ZodTypeAny): JSONSchema7 {
  const result = zodToJsonSchemaLib(schema as Parameters<typeof zodToJsonSchemaLib>[0], {
    target: 'jsonSchema7',
    // Inline every sub-schema so we never emit `$ref`/`definitions` that tool
    // APIs (Anthropic/OpenAI/Gemini) reject or mishandle.
    $refStrategy: 'none',
  }) as JSONSchema7 & Record<string, unknown>;

  // Drop document-level wrapper keys that providers don't expect on a tool's
  // `input_schema`.
  delete result.$schema;
  delete result.definitions;
  delete result.$defs;

  return result;
}

/**
 * Backwards-compatible alias. Prefer {@link convertZodToJsonSchema}.
 */
export const zodToJsonSchema = convertZodToJsonSchema;

/**
 * Convert ToolSchema to provider tool definition format
 */
export function toolSchemaToProviderDefinition(schema: ToolSchema): ProviderToolDefinition {
  return {
    name: schema.name,
    description: schema.description,
    input_schema: zodToJsonSchema(schema.inputSchema),
  };
}

/**
 * Get all tool definitions in provider-specific format
 */
export function getToolDefinitions(
  toolSchemas: Map<string, ToolSchema>,
): Record<string, ProviderToolDefinition> {
  const result: Record<string, ProviderToolDefinition> = {};

  for (const [name, schema] of toolSchemas) {
    result[name] = toolSchemaToProviderDefinition(schema);
  }

  return result;
}
