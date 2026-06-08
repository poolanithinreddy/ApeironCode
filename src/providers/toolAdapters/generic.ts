import type {ToolSchema} from '../../tools/schema.js';
import {AnthropicToolAdapter} from './anthropic.js';
import {OpenAIToolAdapter} from './openai.js';
import type {
  NormalizedToolUse,
  ProviderToolAdapter,
  ToolAdapterFormatResult,
  ToolAdapterParseResult,
  ToolUseDelta,
} from './types.js';

export class GenericToolAdapter implements ProviderToolAdapter {
  readonly providerId = 'generic';

  private readonly openai = new OpenAIToolAdapter();
  private readonly anthropic = new AnthropicToolAdapter();

  formatToolDefinitions(schemas: ToolSchema[]): ToolAdapterFormatResult {
    return this.openai.formatToolDefinitions(schemas);
  }

  parseToolUses(chunk: unknown): ToolAdapterParseResult {
    const warnings: string[] = [];
    const oa = this.openai.parseToolUses(chunk);
    if (oa.toolUses.length > 0) return oa;
    const ant = this.anthropic.parseToolUses(chunk);
    if (ant.toolUses.length > 0) return ant;
    warnings.push('Unknown provider chunk format; no tool uses parsed.');
    return {toolUses: [], warnings};
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
