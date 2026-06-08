import {AppError} from '../utils/errors.js';
import {logger} from '../utils/logger.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from './types.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {name?: string; args?: Record<string, unknown>};
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

export class GeminiProvider implements ModelProvider {
  readonly name = 'gemini';
  readonly displayName = 'Gemini';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'openai' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
  ) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['gemini-2.5-pro', 'gemini-2.5-flash']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    if (!this.apiKey) {
      throw new AppError('Gemini requires GEMINI_API_KEY to be set', 'PROVIDER_NOT_CONFIGURED');
    }

    const tools = options.tools
      ? {
          tools: [
            {
              functionDeclarations: options.tools.map(
                (tool): GeminiFunctionDeclaration => ({
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.input_schema,
                }),
              ),
            },
          ],
        }
      : {};

    const response = await fetch(
      `${this.baseUrl}/models/${options.model}:streamGenerateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: options.messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{text: message.content}],
          })),
          generationConfig: {
            temperature: options.temperature ?? 0.2,
          },
          ...tools,
        }),
        signal: options.signal,
      },
    );

    if (!response.ok) {
      throw new AppError(
        `Gemini returned ${response.status}: ${await response.text()}`,
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

          try {
            const payload = JSON.parse(line) as GeminiResponse;

            if (payload.usageMetadata) {
              inputTokens = payload.usageMetadata.promptTokenCount ?? 0;
              outputTokens = payload.usageMetadata.candidatesTokenCount ?? 0;
            }

            const candidate = payload.candidates?.[0];
            if (!candidate?.content?.parts) continue;

            for (const part of candidate.content.parts) {
              if (part.text) {
                yield {
                  type: 'token',
                  token: part.text,
                };
              } else if (part.functionCall) {
                const toolName = part.functionCall.name;
                const toolArgs = part.functionCall.args;

                if (toolName) {
                  const toolId = `gemini-${Date.now()}-${Math.random()}`;

                  yield {
                    type: 'tool_use_start',
                    toolUseId: toolId,
                    toolName,
                  };

                  if (toolArgs) {
                    const inputStr = JSON.stringify(toolArgs);
                    yield {
                      type: 'tool_use_delta',
                      toolUseId: toolId,
                      toolInputDelta: inputStr,
                    };

                    yield {
                      type: 'tool_use_end',
                      toolUseId: toolId,
                    };
                  }
                }
              }
            }
          } catch (error) {
            logger.debug('Failed to parse Gemini stream event', {line, error});
          }
        }
      }

      yield {
        type: 'done',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };
    } finally {
      reader.releaseLock();
    }
  }
}
