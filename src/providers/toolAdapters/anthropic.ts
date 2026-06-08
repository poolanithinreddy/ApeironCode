import type {ToolSchema} from '../../tools/schema.js';
import {zodToJsonSchema} from '../../tools/schema.js';
import type {
  NormalizedToolUse,
  ProviderToolAdapter,
  ToolAdapterFormatResult,
  ToolAdapterParseResult,
  ToolUseDelta,
} from './types.js';

interface AnthropicContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  delta?: {type?: string; input?: string};
  content_block?: {type?: string; id?: string; name?: string};
}

interface AnthropicChunk {
  type?: string;
  content?: AnthropicContentBlock[];
  content_block?: {type?: string; id?: string; name?: string};
  delta?: {type?: string; input?: string};
  index?: number;
}

export class AnthropicToolAdapter implements ProviderToolAdapter {
  readonly providerId = 'anthropic';

  formatToolDefinitions(schemas: ToolSchema[]): ToolAdapterFormatResult {
    const warnings: string[] = [];
    const definitions = schemas.map((schema) => {
      const json = zodToJsonSchema(schema.inputSchema);
      const properties = (json as {properties?: unknown}).properties ?? {};
      const required = (json as {required?: string[]}).required ?? [];
      return {
        name: schema.name,
        description: schema.description,
        input_schema: {
          type: 'object',
          properties,
          required,
        },
      };
    });
    return {definitions, warnings};
  }

  parseToolUses(chunk: unknown): ToolAdapterParseResult {
    const warnings: string[] = [];
    const toolUses: NormalizedToolUse[] = [];
    const c = chunk as AnthropicChunk | null;
    if (!c) return {toolUses, warnings};

    // Streaming start event
    if (c.type === 'content_block_start' && c.content_block?.type === 'tool_use') {
      const block = c.content_block;
      if (block.id && block.name) {
        toolUses.push({id: block.id, name: block.name, inputJson: '', providerRaw: c});
      }
      return {toolUses, warnings};
    }

    // Complete message with content array
    if (Array.isArray(c.content)) {
      for (const item of c.content) {
        if (item.type === 'tool_use' && item.id && item.name) {
          let inputJson = '';
          try {
            inputJson = item.input === undefined ? '' : JSON.stringify(item.input);
          } catch {
            warnings.push(`Failed to serialize tool input for ${item.name}`);
          }
          toolUses.push({id: item.id, name: item.name, inputJson, providerRaw: item});
        }
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
