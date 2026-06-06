import {AppError} from '../utils/errors.js';
import {logger} from '../utils/logger.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from './types.js';
import {formatProviderToolDefinitions} from './toolAdapters/index.js';

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: {type: string; text?: string; id?: string; name?: string; input?: string};
  delta?: {type: string; text?: string; input?: string};
  message?: {usage?: {input_tokens?: number; output_tokens?: number}};
}

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'anthropic' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
  ) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    if (!this.apiKey) {
      throw new AppError(
        'Anthropic requires ANTHROPIC_API_KEY to be set',
        'PROVIDER_NOT_CONFIGURED',
      );
    }

    const systemPrompt = options.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const conversation = options.messages.filter((message) => message.role !== 'system');

    const tools = options.tools
      ? formatProviderToolDefinitions('anthropic', options.tools)
      : undefined;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        max_tokens: 4096,
        model: options.model,
        system: systemPrompt || undefined,
        messages: conversation.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
        tools: tools,
        temperature: options.temperature ?? 0.2,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new AppError(
        `Anthropic returned ${response.status}: ${await response.text()}`,
        'PROVIDER_HTTP_ERROR',
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AppError('Failed to read response stream', 'PROVIDER_HTTP_ERROR');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const toolUseBuffer = new Map<string, {id: string; name: string; input: string}>();
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

          try {
            const event = JSON.parse(line.slice(6)) as AnthropicStreamEvent;

            if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block?.type === 'tool_use' && block.id && block.name) {
                activeToolUseId = block.id;
                toolUseBuffer.set(activeToolUseId, {
                  id: activeToolUseId,
                  name: block.name,
                  input: '',
                });
                yield {
                  type: 'tool_use_start',
                  toolUseId: activeToolUseId,
                  toolName: block.name,
                };
              }
            } else if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if (delta?.type === 'text_delta') {
                yield {
                  type: 'token',
                  token: delta.text ?? '',
                };
              } else if (delta?.type === 'input_json_delta') {
                if (activeToolUseId) {
                  const buffer = toolUseBuffer.get(activeToolUseId);
                  if (buffer) {
                    buffer.input += delta.input ?? '';
                    yield {
                      type: 'tool_use_delta',
                      toolUseId: activeToolUseId,
                      toolInputDelta: delta.input ?? '',
                    };
                  }
                }
              }
            } else if (event.type === 'content_block_stop') {
              if (activeToolUseId) {
                yield {
                  type: 'tool_use_end',
                  toolUseId: activeToolUseId,
                };
                activeToolUseId = undefined;
              }
            } else if (event.type === 'message_delta') {
              if (event.message?.usage) {
                inputTokens = event.message.usage.input_tokens ?? 0;
                outputTokens = event.message.usage.output_tokens ?? 0;
              }
            } else if (event.type === 'message_stop') {
              yield {
                type: 'done',
                usage: {
                  inputTokens,
                  outputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
              };
            }
          } catch (error) {
            logger.debug('Failed to parse Anthropic stream event', {line, error});
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}