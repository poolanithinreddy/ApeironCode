import type {ToolSchema} from '../../tools/schema.js';

export interface NormalizedToolUse {
  id: string;
  name: string;
  inputJson: string;
  providerRaw?: unknown;
}

export interface ToolUseDelta {
  id: string;
  name?: string;
  inputDelta?: string;
}

export interface ToolAdapterParseResult {
  toolUses: NormalizedToolUse[];
  warnings: string[];
}

export interface ToolAdapterFormatResult {
  definitions: unknown[];
  warnings: string[];
}

export interface ProviderToolAdapter {
  readonly providerId: string;
  formatToolDefinitions(schemas: ToolSchema[]): ToolAdapterFormatResult;
  parseToolUses(chunk: unknown): ToolAdapterParseResult;
  applyDelta(accumulated: Map<string, NormalizedToolUse>, delta: ToolUseDelta): void;
}
