export type JsonSchemaSupport = 'full' | 'partial' | 'none';
export type ToolCallingStrategyId = 'native' | 'native_serialized' | 'disabled';

export interface ProviderToolCapabilities {
  providerId: string;
  nativeToolCalling: boolean;
  streamingToolCalls: boolean;
  parallelToolCalls: boolean;
  jsonSchemaSupport: JsonSchemaSupport;
  maxTools?: number;
  quirks: string[];
  strategy: ToolCallingStrategyId;
}

const TABLE: Record<string, ProviderToolCapabilities> = {
  anthropic: {
    providerId: 'anthropic',
    nativeToolCalling: true,
    streamingToolCalls: true,
    parallelToolCalls: true,
    jsonSchemaSupport: 'full',
    quirks: [],
    strategy: 'native',
  },
  openai: {
    providerId: 'openai',
    nativeToolCalling: true,
    streamingToolCalls: true,
    parallelToolCalls: true,
    jsonSchemaSupport: 'full',
    maxTools: 128,
    quirks: [],
    strategy: 'native',
  },
  openrouter: {
    providerId: 'openrouter',
    nativeToolCalling: true,
    streamingToolCalls: true,
    parallelToolCalls: false,
    jsonSchemaSupport: 'partial',
    maxTools: 64,
    quirks: ['tool support varies by model'],
    strategy: 'native_serialized',
  },
  gemini: {
    providerId: 'gemini',
    nativeToolCalling: true,
    streamingToolCalls: true,
    parallelToolCalls: false,
    jsonSchemaSupport: 'partial',
    maxTools: 64,
    quirks: ['functionCall format differs from OpenAI'],
    strategy: 'native_serialized',
  },
  ollama: {
    providerId: 'ollama',
    nativeToolCalling: false,
    streamingToolCalls: false,
    parallelToolCalls: false,
    jsonSchemaSupport: 'none',
    quirks: ['native tool calling not supported; XML fallback only'],
    strategy: 'disabled',
  },
  mock: {
    providerId: 'mock',
    nativeToolCalling: true,
    streamingToolCalls: true,
    parallelToolCalls: true,
    jsonSchemaSupport: 'full',
    quirks: [],
    strategy: 'native',
  },
};

const DEFAULT_CAPS: ProviderToolCapabilities = {
  providerId: 'unknown',
  nativeToolCalling: false,
  streamingToolCalls: false,
  parallelToolCalls: false,
  jsonSchemaSupport: 'none',
  quirks: ['unknown provider'],
  strategy: 'disabled',
};

export const getProviderToolCapabilities = (providerId: string): ProviderToolCapabilities => {
  return TABLE[providerId] ?? {...DEFAULT_CAPS, providerId};
};

export const supportsNativeToolCalling = (providerId: string): boolean => {
  return getProviderToolCapabilities(providerId).nativeToolCalling;
};
