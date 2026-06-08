import {AppError} from '../utils/errors.js';
import {logger} from '../utils/logger.js';
import type {
  ModelProvider,
  ProviderChatOptions,
  ProviderFactoryContext,
  ProviderStreamChunk,
} from './types.js';
import {formatProviderToolDefinitions} from './toolAdapters/index.js';
import {
  extractToolSchemaNameFromProviderError,
  isToolSchemaProviderError,
  sanitizeOpenAICompatibleTools,
} from './toolSchemaSanitizer.js';

export {sanitizeOpenAICompatibleTools as sanitizeGitHubTools} from './toolSchemaSanitizer.js';

interface OpenAICompatibleProviderOptions {
  apiKey: string | null;
  baseUrl: string;
  name: string;
  displayName: string;
  defaultModels: string[];
  extraHeaders?: Record<string, string>;
  /** When true, a missing API key is a hard, fast-fail auth error. */
  requiresApiKey?: boolean;
  /** Env var name to suggest when the API key is missing. */
  missingApiKeyEnvVar?: string;
  /**
   * Request shaping profile. 'github-models' restricts the payload to the
   * exact fields the GitHub Models inference API accepts and falls back to
   * a non-streaming request if a streaming request is rejected.
   */
  requestProfile?: 'openai' | 'github-models';
}

const GITHUB_VALID_ROLES = new Set(['system', 'developer', 'user', 'assistant']);
const PLACEHOLDER_CONTENT_RE = /^[\s▊█▒░▊]*$/u;

// Greeting / capability questions that never need tools or project context.
const PURE_CHAT_RE = /^\s*(hi|hey|hello|yo|sup|hiya|howdy|good (?:morning|afternoon|evening)|thanks?|thank you|ok(?:ay)?|cool|nice|great|who are you|what can you do|what are you|help|how do you work|what is apeironcode|tell me about yourself|explain what you can (?:help with|do))\b[\s!.?]*$/iu;

/**
 * True when the only real user turn is a trivial greeting/capability
 * question and there is no prior tool/assistant work. Such prompts must be
 * answered with a minimal payload (no tools) so GitHub Models cannot reject
 * a tool schema for a simple "hi".
 */
const isPureChatConversation = (
  messages: Array<{role: string; content: string}>,
): boolean => {
  const nonSystem = messages.filter((message) => message.role !== 'system');
  if (nonSystem.length !== 1) return false;
  const only = nonSystem[0];
  return only?.role === 'user' && PURE_CHAT_RE.test(only.content.trim());
};

interface NormalizedRequest {
  model: string;
  messages: Array<{role: string; content: string}>;
  stream?: boolean;
  temperature?: number;
  tools?: unknown[];
}

/**
 * Builds a GitHub Models / OpenAI-compatible chat request body that matches
 * the verified working curl shape. Only whitelisted fields are sent, message
 * roles/content are sanitized, empty/placeholder assistant turns are dropped,
 * and tools are omitted entirely for pure chat so simple prompts like "hi"
 * do not 400.
 */
export const buildChatRequestBody = (
  options: ProviderChatOptions & {stream: boolean},
  profile: 'openai' | 'github-models',
  opts: {forceNoTools?: boolean} = {},
): NormalizedRequest => {
  const messages = options.messages
    .map((message) => {
      const role = GITHUB_VALID_ROLES.has(message.role) ? message.role : 'user';
      const content = typeof message.content === 'string'
        ? message.content
        : String(message.content ?? '');
      return {role, content};
    })
    // Drop empty/placeholder turns (blank assistant glyphs, spinner cells).
    .filter((message) => !PLACEHOLDER_CONTENT_RE.test(message.content));

  // Pure chat (a lone "hi"), an explicit no-tools fallback, or no tools at
  // all → send zero tools. Otherwise sanitize each tool to a GitHub-valid
  // function schema and drop any that cannot be made object-shaped.
  const requestedTools = options.tools ?? [];
  const wantsTools =
    !opts.forceNoTools &&
    !isPureChatConversation(messages) &&
    requestedTools.length > 0;
  let toolDefs: unknown[] | undefined;
  if (wantsTools) {
    const formatted = formatProviderToolDefinitions('openai', requestedTools);
    toolDefs = sanitizeOpenAICompatibleTools(formatted);
  }

  const body: NormalizedRequest = {
    model: options.model,
    messages,
    stream: options.stream,
    temperature: options.temperature ?? 0.2,
  };
  if (toolDefs && toolDefs.length > 0) {
    body.tools = toolDefs;
  }
  // github-models accepts exactly these keys; the whitelist above already
  // restricts us, so just strip undefined/null for both profiles.
  void profile;
  const clean: NormalizedRequest = {model: body.model, messages: body.messages};
  if (typeof body.stream === 'boolean') clean.stream = body.stream;
  if (typeof body.temperature === 'number') clean.temperature = body.temperature;
  if (body.tools && body.tools.length > 0) clean.tools = body.tools;
  return clean;
};

interface ProviderErrorBody {
  error?: {message?: string; code?: string; type?: string; param?: string};
  message?: string;
}

/**
 * Parses a 400/422 provider response into a safe, actionable message.
 * Never includes the token, request headers, prompt content, or the raw
 * body — only the provider's own error message/code/param.
 */
export const buildProviderBadRequestError = (
  displayName: string,
  status: number,
  rawBody: string,
): AppError => {
  if (isToolSchemaProviderError(rawBody)) {
    const toolName = extractToolSchemaNameFromProviderError(rawBody) ?? 'unknown tool';
    return new AppError(
      `${displayName} rejected a tool schema: ${toolName}. ApeironCode will retry without tools when safe.`,
      'PROVIDER_BAD_REQUEST',
    );
  }

  let safeReason = 'request payload was rejected';
  try {
    const parsed = JSON.parse(rawBody) as ProviderErrorBody;
    const err = parsed.error ?? {};
    const parts = [err.message ?? parsed.message, err.code ?? err.type, err.param ? `field: ${err.param}` : undefined]
      .filter((value): value is string => Boolean(value));
    if (parts.length > 0) {
      safeReason = parts.join(' | ').slice(0, 300);
    }
  } catch {
    safeReason = `non-JSON ${status} response`;
  }
  return new AppError(
    `${displayName} rejected the request payload (${status}): ${safeReason}`,
    'PROVIDER_BAD_REQUEST',
  );
};

/**
 * Builds a clean, actionable authentication error. Never includes the token
 * or raw provider response body so secrets cannot leak into logs/UI.
 */
export const buildProviderAuthError = (
  displayName: string,
  envVar: string | undefined,
  reason: 'missing' | 'rejected',
): AppError => {
  const tokenVar = envVar ?? 'the provider API key';
  const header = reason === 'missing'
    ? `${displayName} is not configured: ${tokenVar} is not set.`
    : `${displayName} authentication failed. Your token is invalid, expired, missing Models: Read permission, or ${displayName} is not enabled for this account/org.`;
  const message = [
    header,
    '',
    'Possible fixes:',
    `1. Create a GitHub token with Models: Read permission.`,
    `2. Export it:`,
    `   export ${tokenVar}="github_pat_..."`,
    `3. Verify it:`,
    `   apeironcode doctor --strict`,
    `4. Then restart:`,
    `   apeironcode`,
  ].join('\n');
  return new AppError(message, 'PROVIDER_AUTH_ERROR');
};

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

export class OpenAICompatibleProvider implements ModelProvider {
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'openai' as const;

  constructor(private readonly options: OpenAICompatibleProviderOptions) {}

  get name(): string {
    return this.options.name;
  }

  get displayName(): string {
    return this.options.displayName;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    try {
      const response = await fetch(`${this.options.baseUrl}/models`, {
        headers: this.buildHeaders(),
        signal,
      });

      if (!response.ok) {
        throw new AppError(`Provider returned ${response.status} while listing models`, 'PROVIDER_HTTP_ERROR');
      }

      const payload = (await response.json()) as {data?: Array<{id?: string}>};
      const remoteModels = payload.data
        ?.map((entry) => entry.id)
        .filter((value): value is string => Boolean(value));

      return remoteModels && remoteModels.length > 0
        ? remoteModels
        : this.options.defaultModels;
    } catch (error) {
      logger.debug('Falling back to default model list', {
        provider: this.options.name,
        error,
      });
      return this.options.defaultModels;
    }
  }

  private postChat(
    options: ProviderChatOptions,
    stream: boolean,
    forceNoTools = false,
  ): Promise<Response> {
    const profile = this.options.requestProfile ?? 'openai';
    return fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildChatRequestBody({...options, stream}, profile, {forceNoTools}),
      ),
      signal: options.signal,
    });
  }

  // Conservative safe upper bound for a single GitHub Models request body.
  // Pure chat/simple actions stay far below this; this only trips when heavy
  // context/tools would otherwise cause a 413.
  private static readonly GITHUB_MAX_PAYLOAD_BYTES = 130_000;

  private buildPayloadTooLargeError(): AppError {
    return new AppError(
      `${this.options.displayName} payload too large. ApeironCode reduced context/tools; please send a narrower request or switch to OpenAI/Anthropic for large-context tasks.`,
      'PROVIDER_PAYLOAD_TOO_LARGE',
    );
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    if (response.status === 413) {
      await response.text().catch(() => undefined);
      throw this.buildPayloadTooLargeError();
    }
    // 401/403: clean auth error, never surface the body (it can echo token).
    if (response.status === 401 || response.status === 403) {
      await response.text().catch(() => undefined);
      throw buildProviderAuthError(
        this.options.displayName,
        this.options.missingApiKeyEnvVar,
        'rejected',
      );
    }
    if (response.status === 400 || response.status === 422) {
      const rawBody = await response.text().catch(() => '');
      throw buildProviderBadRequestError(this.options.displayName, response.status, rawBody);
    }
    await response.text().catch(() => undefined);
    throw new AppError(`Provider returned ${response.status}`, 'PROVIDER_HTTP_ERROR');
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    this.assertConfigured();

    const isGitHub = (this.options.requestProfile ?? 'openai') === 'github-models';

    // Payload budget guard: estimate the body size before sending. If a
    // GitHub Models request is too large, drop tools first; if it is still
    // too large, fail fast with a clear message (never send a doomed 413
    // request, never retry the exact same oversized payload).
    let effectiveOptions = options;
    if (isGitHub) {
      const sized = (opts: ProviderChatOptions, noTools: boolean): number =>
        Buffer.byteLength(
          JSON.stringify(buildChatRequestBody({...opts, stream: true}, 'github-models', {forceNoTools: noTools})),
          'utf8',
        );
      if (sized(options, false) > OpenAICompatibleProvider.GITHUB_MAX_PAYLOAD_BYTES) {
        if (sized(options, true) > OpenAICompatibleProvider.GITHUB_MAX_PAYLOAD_BYTES) {
          throw this.buildPayloadTooLargeError();
        }
        effectiveOptions = {...options, tools: undefined};
      }
    }

    let response = await this.postChat(effectiveOptions, true);
    options = effectiveOptions;

    if (!response.ok && (response.status === 400 || response.status === 422)) {
      const status = response.status;
      const rawBody = await response.text().catch(() => '');
      const sentTools = Boolean(options.tools && options.tools.length > 0);
      const schemaError = isToolSchemaProviderError(rawBody);

      // Tool-schema rejection: retry once with tools disabled so a simple
      // prompt still answers. If the prompt genuinely needed tools, surface
      // a safe, actionable message instead of looping.
      if (schemaError && sentTools) {
        const toolName = extractToolSchemaNameFromProviderError(rawBody) ?? 'unknown tool';
        const noTools = await this.postChat(options, true, true);
        if (noTools.ok) {
          yield* this.consumeStream(noTools);
          return;
        }
        await noTools.text().catch(() => undefined);
        throw new AppError(
          `${this.options.displayName} rejected a tool schema: ${toolName}. ApeironCode retried without tools but the request still failed.`,
          'PROVIDER_BAD_REQUEST',
        );
      }

      // Non-schema payload error: try once without streaming.
      if (isGitHub) {
        const nonStream = await this.postChat(options, false);
        if (nonStream.ok) {
          yield* this.yieldNonStreaming(nonStream);
          return;
        }
        await nonStream.text().catch(() => undefined);
      }
      throw buildProviderBadRequestError(this.options.displayName, status, rawBody);
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    yield* this.consumeStream(response);
  }

  private async *consumeStream(response: Response): AsyncGenerator<ProviderStreamChunk> {
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
                  const buffer = toolUseBuffer.get(activeToolUseId);
                  if (buffer) {
                    buffer.arguments += toolCall.function.arguments;
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
            logger.debug('Failed to parse OpenAI stream event', {data, error});
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *yieldNonStreaming(response: Response): AsyncGenerator<ProviderStreamChunk> {
    const payload = (await response.json().catch(() => ({}))) as OpenAIChatResponse;
    const content = payload.choices?.[0]?.message?.content ?? '';
    if (content) {
      yield {type: 'token', token: content};
    }
    yield {
      type: 'done',
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0,
      },
    };
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.options.extraHeaders,
    };

    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }

  protected assertConfigured(): void {
    if (!this.options.baseUrl) {
      throw new AppError(
        `Provider ${this.options.displayName} is missing a base URL`,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    if (this.options.requiresApiKey && !this.options.apiKey) {
      throw buildProviderAuthError(
        this.options.displayName,
        this.options.missingApiKeyEnvVar,
        'missing',
      );
    }
  }
}

export const createOpenAICompatibleProvider = (
  options: Omit<OpenAICompatibleProviderOptions, 'apiKey' | 'baseUrl'>,
) => {
  return (context: ProviderFactoryContext): ModelProvider =>
    new OpenAICompatibleProvider({
      ...options,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl || GITHUB_MODELS_INFERENCE_FALLBACK(options.name),
    });
};

// GitHub Models has a fixed, well-known base URL. If config somehow lacks it
// (older config, race), fall back to the correct endpoint instead of failing
// with an unrelated "missing base URL" error.
const GITHUB_MODELS_INFERENCE_FALLBACK = (name: string): string =>
  name === 'github-models' ? 'https://models.github.ai/inference' : '';
