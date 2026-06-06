import {AppError} from '../utils/errors.js';
import {logger} from '../utils/logger.js';
import type {
  ModelProvider,
  ProviderChatOptions,
  ProviderMessage,
  ProviderStreamChunk,
} from './types.js';

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    delta?: {
      content?: string | null;
      tool_calls?: Array<{id: string; function: {name: string; arguments?: string}}>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

const buildMessages = (messages: ProviderMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

const buildTools = (
  tools: Array<{name: string; description: string; input_schema: unknown}> | undefined,
) => {
  if (!tools) return undefined;
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
};

export class AzureOpenAIProvider implements ModelProvider {
  readonly name = 'azure';
  readonly displayName = 'Azure OpenAI';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'openai' as const;

  private readonly apiKey: string | null;
  private readonly endpoint: string;
  private readonly deployment: string;
  private readonly apiVersion: string;

  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY ?? null;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? '';
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? '';
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';
  }

  listModels(): Promise<string[]> {
    return Promise.resolve([this.deployment || 'gpt-4-turbo']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    this.assertConfigured();

    const url = new URL(
      `/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`,
      this.endpoint,
    );

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey ?? '',
      },
      body: JSON.stringify({
        messages: buildMessages(options.messages),
        stream: true,
        temperature: options.temperature ?? 0.2,
        tools: buildTools(options.tools),
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new AppError(
        `Azure OpenAI returned ${response.status}: ${await response.text()}`,
        'PROVIDER_HTTP_ERROR',
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AppError('Failed to read response stream', 'PROVIDER_HTTP_ERROR');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;
    const toolUseBuffer = new Map<string, {id: string; name: string; arguments: string}>();
    let activeToolUseId: string | undefined;

    try {
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value as Uint8Array, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            yield {
              type: 'done',
              usage: {
                inputTokens: promptTokens,
                outputTokens: completionTokens,
                totalTokens: promptTokens + completionTokens,
              },
            };
            continue;
          }

          try {
            const event = JSON.parse(data) as OpenAIChatResponse;

            if (event.usage) {
              promptTokens = event.usage.prompt_tokens ?? 0;
              completionTokens = event.usage.completion_tokens ?? 0;
            }

            const choice = event.choices?.[0];
            if (!choice?.delta) continue;

            if (choice.delta.content) {
              yield {
                type: 'token',
                token: choice.delta.content,
              };
            }

            if (choice.delta.tool_calls) {
              for (const toolCall of choice.delta.tool_calls) {
                if (!activeToolUseId || activeToolUseId !== toolCall.id) {
                  activeToolUseId = toolCall.id;
                  toolUseBuffer.set(activeToolUseId, {
                    id: activeToolUseId,
                    name: toolCall.function.name,
                    arguments: '',
                  });
                  yield {
                    type: 'tool_use_start',
                    toolUseId: activeToolUseId,
                    toolName: toolCall.function.name,
                  };
                }

                if (toolCall.function.arguments) {
                  const buf = toolUseBuffer.get(activeToolUseId);
                  if (buf) {
                    buf.arguments += toolCall.function.arguments;
                    yield {
                      type: 'tool_use_delta',
                      toolUseId: activeToolUseId,
                      toolInputDelta: toolCall.function.arguments,
                    };
                  }
                }
              }
            }

            if (choice.finish_reason === 'tool_calls' && activeToolUseId) {
              yield {
                type: 'tool_use_end',
                toolUseId: activeToolUseId,
              };
              activeToolUseId = undefined;
            }
          } catch (error) {
            logger.debug('Failed to parse Azure OpenAI stream event', {data, error});
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new AppError('Azure OpenAI requires AZURE_OPENAI_API_KEY to be set', 'PROVIDER_NOT_CONFIGURED');
    }
    if (!this.endpoint) {
      throw new AppError('Azure OpenAI requires AZURE_OPENAI_ENDPOINT to be set', 'PROVIDER_NOT_CONFIGURED');
    }
    if (!this.deployment) {
      throw new AppError('Azure OpenAI requires AZURE_OPENAI_DEPLOYMENT to be set', 'PROVIDER_NOT_CONFIGURED');
    }
  }
}
