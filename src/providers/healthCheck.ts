import type {ModelProvider, ProviderChatOptions} from './types.js';
import type {ProviderToolDefinition} from '../tools/schema.js';

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  providerId?: string;
  model?: string;
  error?: string;
  receivedFirstToken?: boolean;
  receivedDone?: boolean;
  toolCallingSupported?: boolean;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  providerId?: string;
  model?: string;
  includeToolCheck?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const withAbortTimeout = async <T>(
  asyncFn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await asyncFn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const redactErrorMessage = (message: string): string => {
  let redacted = message;
  // Redact common secret patterns
  redacted = redacted.replace(/(api[_-]?key|key|secret|token)[:=]\s*[^\s,\n]*/gi, '$1=***');
  redacted = redacted.replace(/Bearer\s+[^\s,]*/gi, 'Bearer ***');
  redacted = redacted.replace(/Authorization[:=]\s*[^\s,\n]*/gi, 'Authorization=***');
  return redacted;
};

export async function checkProviderHealth(
  provider: ModelProvider,
  model: string,
  options?: HealthCheckOptions,
): Promise<HealthCheckResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  let receivedFirstToken = false;
  let receivedDone = false;

  try {
    // Build a minimal test message
    const testMessages = [{content: 'Say hi.', role: 'user' as const}];

    // Optionally include a fake tool for testing tool-calling support
    const testTools = options?.includeToolCheck
      ? ([{
          name: 'test_tool',
          description: 'A test tool to verify tool-calling support.',
          input_schema: {
            type: 'object',
            properties: {message: {type: 'string'}},
          },
        }] as unknown as ProviderToolDefinition[])
      : undefined;

    const chatOptions: ProviderChatOptions = {
      model,
      messages: testMessages,
      tools: testTools,
      temperature: 0.1,
    };

    // Run health check with timeout
    await withAbortTimeout(async (signal) => {
      for await (const chunk of provider.stream({...chatOptions, signal})) {
        if (chunk.type === 'token') {
          receivedFirstToken = true;
        } else if (chunk.type === 'tool_use_start') {
          receivedFirstToken = true;
        } else if (chunk.type === 'done') {
          receivedDone = true;
        }
      }
    }, timeoutMs);

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      providerId: provider.name,
      model,
      receivedFirstToken,
      receivedDone,
      toolCallingSupported: provider.supportsToolCalling,
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    // Check for timeout
    if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        providerId: provider.name,
        model,
        error: `Health check timed out after ${timeoutMs}ms`,
        receivedFirstToken,
        receivedDone,
      };
    }

    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      providerId: provider.name,
      model,
      error: redactErrorMessage(errorMessage),
      receivedFirstToken,
      receivedDone,
    };
  }
}
