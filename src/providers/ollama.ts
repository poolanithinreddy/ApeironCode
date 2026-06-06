import {AppError} from '../utils/errors.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from './types.js';

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';
  readonly displayName = 'Ollama';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = false;
  readonly nativeToolFormat = 'ollama' as const;

  constructor(private readonly baseUrl: string) {}

  async listModels(signal?: AbortSignal): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {signal});

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const payload = (await response.json()) as {models?: Array<{name?: string}>};
      return payload.models
        ?.map((entry) => entry.name)
        .filter((value): value is string => Boolean(value)) ?? [
        'qwen2.5-coder:7b',
        'qwen2.5-coder:14b',
        'deepseek-coder',
        'codellama',
        'llama3.1',
        'llama3.2',
      ];
    } catch {
      return [
        'qwen2.5-coder:7b',
        'qwen2.5-coder:14b',
        'deepseek-coder',
        'codellama',
        'llama3.1',
        'llama3.2',
      ];
    }
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new AppError(
        `Ollama returned ${response.status}: ${await response.text()}`,
        'PROVIDER_HTTP_ERROR',
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value as Uint8Array, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const payload = JSON.parse(line) as OllamaChatResponse & {
            prompt_eval_count?: number;
            eval_count?: number;
          };
          const chunk = payload.message?.content ?? '';

          if (payload.prompt_eval_count !== undefined) {
            promptTokens = payload.prompt_eval_count;
          }
          if (payload.eval_count !== undefined) {
            completionTokens = payload.eval_count;
          }

          if (chunk) {
            yield {
              type: 'token',
              token: chunk,
            };
          }
        }
      }

      yield {
        type: 'done',
        usage: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } finally {
      reader.releaseLock();
    }
  }
}