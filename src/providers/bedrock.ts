import crypto from 'node:crypto';

import {AppError} from '../utils/errors.js';
import {logger} from '../utils/logger.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from './types.js';

interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BedrockRequest {
  messages: BedrockMessage[];
  max_tokens: number;
  temperature?: number;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: unknown;
  }>;
}

interface BedrockStreamEvent {
  type: string;
  index?: number;
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: string;
  };
  delta?: {
    type: string;
    text?: string;
    input?: string;
  };
  message?: {
    usage?: {input_tokens?: number; output_tokens?: number};
  };
}

const signRequest = (
  method: string,
  path: string,
  query: string,
  headers: Record<string, string>,
  body: string,
  accessKey: string,
  secretKey: string,
  region: string,
): Record<string, string> => {
  const amzDate = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 8) +
    new Date().toISOString().replace(/[-:.]/g, '').slice(9, 15);
  const dateStamp = amzDate.slice(0, 8);
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const service = 'bedrock';

  const canonicalUri = path;
  const canonicalQueryString = query || '';
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key]}\n`)
    .join('');
  const signedHeaders = Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(';');

  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto
    .createHmac('sha256', `AWS4${secretKey}`)
    .update(dateStamp)
    .digest();
  const kRegion = crypto
    .createHmac('sha256', kDate)
    .update(region)
    .digest();
  const kService = crypto
    .createHmac('sha256', kRegion)
    .update(service)
    .digest();
  const kSigning = crypto
    .createHmac('sha256', kService)
    .update('aws4_request')
    .digest();
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  return {
    ...headers,
    Authorization:
      `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'X-Amz-Date': amzDate,
  };
};

export class BedrockProvider implements ModelProvider {
  readonly name = 'bedrock';
  readonly displayName = 'AWS Bedrock';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'anthropic' as const;

  private readonly region: string;
  private readonly accessKeyId: string | null;
  private readonly secretAccessKey: string | null;
  private readonly sessionToken: string | null;
  private readonly endpoint: string;

  constructor() {
    this.region = process.env.AWS_REGION ?? 'us-east-1';
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? null;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? null;
    this.sessionToken = process.env.AWS_SESSION_TOKEN ?? null;
    this.endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`;
  }

  listModels(): Promise<string[]> {
    return Promise.resolve(['anthropic.claude-3-5-sonnet-20241022-v2:0', 'anthropic.claude-3-5-haiku-20241022-v1:0']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new AppError(
        'Bedrock requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to be set',
        'PROVIDER_NOT_CONFIGURED',
      );
    }

    const conversation = options.messages.filter((message) => message.role !== 'system');

    const tools = options.tools
      ? options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema,
        }))
      : undefined;

    const body: BedrockRequest = {
      messages: conversation.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
      max_tokens: 4096,
      temperature: options.temperature ?? 0.2,
    };

    if (tools) {
      body.tools = tools;
    }

    const path = `/model/${options.model}/converse-stream`;
    const bodyStr = JSON.stringify(body);

    const headers = {
      'Content-Type': 'application/json',
      'X-Amz-Target': 'AmazonBedrockAgentRuntime.InvokeModel',
      Host: `bedrock-runtime.${this.region}.amazonaws.com`,
    };

    if (this.sessionToken) {
      (headers as Record<string, string>)['X-Amz-Security-Token'] = this.sessionToken;
    }

    const signedHeaders = signRequest(
      'POST',
      path,
      '',
      headers,
      bodyStr,
      this.accessKeyId,
      this.secretAccessKey,
      this.region,
    );

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: 'POST',
        headers: signedHeaders,
        body: bodyStr,
        signal: options.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AppError(`Bedrock returned ${response.status}: ${errorText}`, 'PROVIDER_HTTP_ERROR');
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
              const event = JSON.parse(line.slice(6)) as BedrockStreamEvent;

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
                    const buf = toolUseBuffer.get(activeToolUseId);
                    if (buf) {
                      buf.input += delta.input ?? '';
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
              logger.debug('Failed to parse Bedrock stream event', {line, error});
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Bedrock request failed: ${String(error)}`, 'PROVIDER_HTTP_ERROR');
    }
  }
}
