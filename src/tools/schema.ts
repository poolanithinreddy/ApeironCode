import type {ZodTypeAny} from 'zod';
import {z} from 'zod';
import type {JSONSchema7} from 'json-schema';
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
 * Convert Zod schema to JSON Schema 7 format (compatible with Anthropic, OpenAI, Ollama)
 */
export function zodToJsonSchema(schema: ZodTypeAny): JSONSchema7 {
  // Handle basic types
  if (schema instanceof z.ZodString) {
    return {type: 'string'};
  }
  if (schema instanceof z.ZodNumber) {
    return {type: 'number'};
  }
  if (schema instanceof z.ZodBoolean) {
    return {type: 'boolean'};
  }
  if (schema instanceof z.ZodArray) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const arrayType = (schema._def as any).type;
    return {
      type: 'array',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      items: zodToJsonSchema(arrayType),
    };
  }
  if (schema instanceof z.ZodEnum) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const enumValues = (schema._def as any).values;
    return {
      type: 'string',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      enum: enumValues,
    };
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, JSONSchema7> = {};
    const required: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const shape = (schema._def as any).shape();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    for (const [key, value] of Object.entries(shape)) {
      const subSchema = value as ZodTypeAny;
      properties[key] = zodToJsonSchema(subSchema);

      // Check if optional (unwrap optional types)
      if (!(subSchema instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // Handle optional/nullable types
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    return zodToJsonSchema((schema._def as any).innerType);
  }

  // Default fallback
  return {type: 'object'};
}

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
