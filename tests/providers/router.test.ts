import {describe, expect, it, vi} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {estimateUsageCost} from '../../src/providers/pricing.js';
import {resolveProviderRouting, RoutedProvider} from '../../src/providers/router.js';
import type {ModelProvider, ProviderStreamChunk} from '../../src/providers/types.js';

const createProvider = (
  name: string,
  streamImpl: () => AsyncGenerator<ProviderStreamChunk>,
): ModelProvider => ({
  displayName: name,
  nativeToolFormat: 'anthropic',
  async *stream() {
    yield* streamImpl();
  },
  listModels: () => Promise.resolve([`${name}-model`]),
  name,
  supportsStreaming: true,
  supportsToolCalling: false,
});

describe('provider routing', () => {
  it('resolves role-based primary and fallback routes', () => {
    const config = {
      ...DEFAULT_CONFIG,
      fallbackModel: 'mock:mock-coder',
      models: {
        reasoning: 'openai:o3-mini',
      },
    };

    const route = resolveProviderRouting({config, mode: 'review'});

    expect(route.primary.modelRef).toBe('openai:o3-mini');
    expect(route.primary.source).toBe('role');
    expect(route.fallback?.modelRef).toBe('mock:mock-coder');
  });

  it('fails over to the fallback provider when the primary stream fails', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      defaultModel: 'qwen2.5-coder:7b',
      defaultProvider: 'ollama',
      fallbackModel: 'mock:mock-coder',
    };
    const routing = resolveProviderRouting({config, mode: 'chat'});
    const fallbackSpy = vi.fn();
    const registry = {
      create(providerName: string) {
        if (providerName === 'ollama') {
          // eslint-disable-next-line require-yield, @typescript-eslint/require-await
          return createProvider('ollama', async function* () {
            throw new Error('primary failure');
          });
        }

        // eslint-disable-next-line @typescript-eslint/require-await
        return createProvider('mock', async function* () {
          fallbackSpy();
          yield {type: 'token', token: 'fallback response'} as const;
          yield {type: 'done', usage: {inputTokens: 0, outputTokens: 0, totalTokens: 0}} as const;
        });
      },
    };
    const onFallback = vi.fn();
    const provider = new RoutedProvider(config, registry as never, routing, onFallback);

    let message = '';
    for await (const chunk of provider.stream({messages: [], model: config.defaultModel})) {
      if (chunk.type === 'token') {
        message += chunk.token ?? '';
      }
    }

    expect(message).toBe('fallback response');
    expect(provider.currentRoute.providerName).toBe('mock');
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
  });

  it('estimates usage cost from the model catalog', () => {
    const usage = estimateUsageCost('openai', 'o3-mini', {
      inputTokens: 2_000,
      outputTokens: 500,
      totalTokens: 2_500,
    });

    expect(usage?.estimatedCostUsd).toBeCloseTo(0.0044, 6);
  });
});