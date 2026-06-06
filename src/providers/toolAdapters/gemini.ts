import type {ToolSchema} from '../../tools/schema.js';
import {zodToJsonSchema} from '../../tools/schema.js';
import type {
  NormalizedToolUse,
  ProviderToolAdapter,
  ToolAdapterFormatResult,
  ToolAdapterParseResult,
  ToolUseDelta,
} from './types.js';

interface GeminiPart {
  text?: string;
  functionCall?: {name?: string; args?: Record<string, unknown>};
}

interface GeminiChunk {
  candidates?: Array<{content?: {parts?: GeminiPart[]}}>;
}

export class GeminiToolAdapter implements ProviderToolAdapter {
  readonly providerId = 'gemini';

  formatToolDefinitions(schemas: ToolSchema[]): ToolAdapterFormatResult {
    const warnings: string[] = [];
    const functionDeclarations = schemas.map((schema) => {
      const json = zodToJsonSchema(schema.inputSchema);
      const properties = (json as {properties?: unknown}).properties ?? {};
      const required = (json as {required?: string[]}).required ?? [];
      return {
        name: schema.name,
        description: schema.description,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      };
    });
    return {definitions: [{functionDeclarations}], warnings};
  }

  parseToolUses(chunk: unknown): ToolAdapterParseResult {
    const warnings: string[] = [];
    const toolUses: NormalizedToolUse[] = [];
    const c = chunk as GeminiChunk | null;
    const parts = c?.candidates?.[0]?.content?.parts ?? [];
    let counter = 0;
    for (const part of parts) {
      if (part.functionCall?.name) {
        let inputJson = '';
        try {
          inputJson = JSON.stringify(part.functionCall.args ?? {});
        } catch {
          warnings.push(`Failed to serialize args for ${part.functionCall.name}`);
        }
        toolUses.push({
          id: `gemini-fc-${counter}`,
          name: part.functionCall.name,
          inputJson,
          providerRaw: part,
        });
        counter += 1;
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
