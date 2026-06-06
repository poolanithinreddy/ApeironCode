import type {ToolSchema} from '../../tools/schema.js';
import {zodToJsonSchema} from '../../tools/schema.js';
import type {
  NormalizedToolUse,
  ProviderToolAdapter,
  ToolAdapterFormatResult,
  ToolAdapterParseResult,
  ToolUseDelta,
} from './types.js';

interface OpenAIToolCall {
  index?: number;
  id?: string;
  function?: {name?: string; arguments?: string};
}

interface OpenAIChunk {
  choices?: Array<{
    delta?: {tool_calls?: OpenAIToolCall[]};
    message?: {tool_calls?: OpenAIToolCall[]};
  }>;
}

export class OpenAIToolAdapter implements ProviderToolAdapter {
  readonly providerId = 'openai';

  formatToolDefinitions(schemas: ToolSchema[]): ToolAdapterFormatResult {
    const warnings: string[] = [];
    const definitions = schemas.map((schema) => {
      const json = zodToJsonSchema(schema.inputSchema);
      const properties = (json as {properties?: unknown}).properties ?? {};
      const required = (json as {required?: string[]}).required ?? [];
      return {
        type: 'function' as const,
        function: {
          name: schema.name,
          description: schema.description,
          parameters: {
            type: 'object',
            properties,
            required,
          },
        },
      };
    });
    return {definitions, warnings};
  }

  parseToolUses(chunk: unknown): ToolAdapterParseResult {
    const warnings: string[] = [];
    const toolUses: NormalizedToolUse[] = [];
    const c = chunk as OpenAIChunk | null;
    const calls = c?.choices?.[0]?.message?.tool_calls ?? c?.choices?.[0]?.delta?.tool_calls;
    if (!calls) return {toolUses, warnings};
    for (const call of calls) {
      if (call.id && call.function?.name) {
        toolUses.push({
          id: call.id,
          name: call.function.name,
          inputJson: call.function.arguments ?? '',
          providerRaw: call,
        });
      }
    }
    return {toolUses, warnings};
  }

  applyDelta(accumulated: Map<string, NormalizedToolUse>, delta: ToolUseDelta): void {
    if (!accumulated.has(delta.id)) {
      accumulated.set(delta.id, {id: delta.id, name: delta.name ?? '', inputJson: ''});
    }
    const entry = accumulated.get(delta.id)!;
    if (delta.name && !entry.name) entry.name = delta.name;
    if (delta.inputDelta) entry.inputJson += delta.inputDelta;
  }
}
