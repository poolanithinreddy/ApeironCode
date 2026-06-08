import {describe, expect, it} from 'vitest';

import {checkProviderHealth} from '../../src/providers/healthCheck.js';
import {MockProvider} from '../../src/providers/mock.js';

describe('Provider Health Check', () => {
  it('returns ok=true for healthy provider', async () => {
    const provider = new MockProvider();

    const result = await checkProviderHealth(provider, 'mock-coder', {timeoutMs: 5000});

    expect(result.ok).toBe(true);
    expect(result.providerId).toBe('mock');
    expect(result.model).toBe('mock-coder');
    expect(result.receivedFirstToken).toBe(true);
  });

  it('returns provider metadata in result', async () => {
    const provider = new MockProvider();

    const result = await checkProviderHealth(provider, 'mock-coder');

    expect(result.providerId).toBe(provider.name);
    expect(result.model).toBe('mock-coder');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles provider errors gracefully', async () => {
    // eslint-disable-next-line require-yield, @typescript-eslint/require-await
    async function* failingStream() {
      throw new Error('Provider error occurred');
    }
    const failingProvider = {
      name: 'failing',
      displayName: 'Failing Provider',
      supportsStreaming: true,
      supportsToolCalling: false,
      nativeToolFormat: 'anthropic' as const,
      listModels: () => Promise.resolve([]),
      stream: failingStream,
    };

    const result = await checkProviderHealth(failingProvider, 'test-model');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Provider error');
  });

  it('redacts secrets from error messages', async () => {
    // eslint-disable-next-line require-yield, @typescript-eslint/require-await
    async function* secretStream() {
      throw new Error('API_KEY=sk-1234567890');
    }
    const failingProvider = {
      name: 'failing',
      displayName: 'Failing',
      supportsStreaming: true,
      supportsToolCalling: false,
      nativeToolFormat: 'anthropic' as const,
      listModels: () => Promise.resolve([]),
      stream: secretStream,
    };

    const result = await checkProviderHealth(failingProvider, 'test-model');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('***');
    expect(result.error).not.toContain('sk-1234567890');
  });

  it('returns ok=false on timeout', async () => {
    // eslint-disable-next-line require-yield
    async function* slowStream(options: {signal?: AbortSignal}) {
      // Wait forever, will be interrupted by timeout
      const abortController = new AbortController();
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          abortController.abort();
        });
      }
      await new Promise((resolve, reject) => {
        abortController.signal.addEventListener('abort', () => {
          reject(new Error('Stream aborted'));
        });
      });
    }
    const slowProvider = {
      name: 'slow',
      displayName: 'Slow',
      supportsStreaming: true,
      supportsToolCalling: false,
      nativeToolFormat: 'anthropic' as const,
      listModels: () => Promise.resolve([]),
      stream: slowStream,
    };

    const result = await checkProviderHealth(slowProvider, 'test-model', {timeoutMs: 100});

    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('tracks token reception', async () => {
    const provider = new MockProvider();

    const result = await checkProviderHealth(provider, 'mock-coder');

    expect(result.receivedFirstToken).toBe(true);
  });

  it('includes tool calling support info', async () => {
    const provider = new MockProvider();

    const result = await checkProviderHealth(provider, 'mock-coder');

    expect(result.toolCallingSupported).toBe(provider.supportsToolCalling);
  });

  it('includes done chunk when provider completes', async () => {
    const provider = new MockProvider();

    const result = await checkProviderHealth(provider, 'mock-coder');

    expect(result.receivedDone).toBeDefined();
  });
});
