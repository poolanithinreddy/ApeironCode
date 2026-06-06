import type {TokenBreakdown} from '../tokens/types.js';
import type {ProviderToolDefinition} from '../tools/schema.js';

export type ProviderRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ProviderMessage {
  role: ProviderRole;
  content: string;
  name?: string;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  tokenBreakdown?: Partial<TokenBreakdown>;
  breakdown?: Array<{
    provider: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }>;
}

/**
 * Streaming chunks from provider.stream()
 */
export interface ProviderStreamChunk {
  type: 'token' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'done';

  // For type='token'
  token?: string;

  // For type='tool_use_*'
  toolName?: string;
  toolUseId?: string;
  toolInputDelta?: string;  // Incremental JSON

  // For type='done'
  usage?: ProviderUsage;
  finalText?: string;
}

export interface ProviderChatOptions {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderToolDefinition[];
  temperature?: number;
  signal?: AbortSignal;
}

export interface ProviderChatResult {
  message: string;
  usage?: ProviderUsage;
  raw?: unknown;
}

export interface ModelProvider {
  readonly name: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly supportsToolCalling: boolean;
  readonly nativeToolFormat: 'anthropic' | 'openai' | 'ollama';

  listModels(signal?: AbortSignal): Promise<string[]>;

  /**
   * Stream response from provider
   * Replaces the old chat() method
   */
  stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk>;
}

export interface ProviderFactoryContext {
  apiKey: string | null;
  baseUrl: string;
}

export type ProviderFactory = (context: ProviderFactoryContext) => ModelProvider;
