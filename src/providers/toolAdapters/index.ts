import {AnthropicToolAdapter} from './anthropic.js';
import {GeminiToolAdapter} from './gemini.js';
import {GenericToolAdapter} from './generic.js';
import {OpenAIToolAdapter} from './openai.js';
import type {ProviderToolAdapter} from './types.js';
import type {ProviderToolDefinition} from '../../tools/schema.js';

export * from './types.js';
export {AnthropicToolAdapter} from './anthropic.js';
export {OpenAIToolAdapter} from './openai.js';
export {GeminiToolAdapter} from './gemini.js';
export {GenericToolAdapter} from './generic.js';

export const getToolAdapter = (providerId: string): ProviderToolAdapter => {
  switch (providerId) {
    case 'anthropic':
      return new AnthropicToolAdapter();
    case 'openai':
    case 'openrouter':
    case 'azure':
    case 'deepseek':
    case 'groq':
      return new OpenAIToolAdapter();
    case 'gemini':
      return new GeminiToolAdapter();
    default:
      return new GenericToolAdapter();
  }
};

/**
 * Convert pre-built provider tool definitions (registry output, JSON-schema)
 * into the on-the-wire shape each provider expects.
 *
 * Live providers (anthropic.ts, openaiCompatible.ts) call this so wire
 * formatting is centralized in the adapter layer.
 */
export const formatProviderToolDefinitions = (
  providerId: string,
  defs: ProviderToolDefinition[],
): unknown[] => {
  switch (providerId) {
    case 'openai':
    case 'openrouter':
    case 'azure':
    case 'deepseek':
    case 'groq':
      return defs.map((def) => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.input_schema,
        },
      }));
    case 'anthropic':
    default:
      return defs.map((def) => ({
        name: def.name,
        description: def.description,
        input_schema: def.input_schema,
      }));
  }
};
