import {describe, expect, it, vi} from 'vitest';

describe('AzureOpenAIProvider', () => {
  it('requires AZURE_OPENAI_API_KEY to be set', async () => {
    const originalKey = process.env.AZURE_OPENAI_API_KEY;
    try {
      delete process.env.AZURE_OPENAI_API_KEY;
      const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
      const provider = new AzureOpenAIProvider();

      let error: Error | undefined;
      try {
        for await (const _chunk of provider.stream({
          messages: [{content: 'test', role: 'user'}],
          model: 'gpt-4-turbo',
        })) {
          void _chunk;
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('API_KEY');
    } finally {
      if (originalKey) process.env.AZURE_OPENAI_API_KEY = originalKey;
    }
  });

  it('requires AZURE_OPENAI_ENDPOINT to be set', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    const originalEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    try {
      delete process.env.AZURE_OPENAI_ENDPOINT;
      const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
      const provider = new AzureOpenAIProvider();

      let error: Error | undefined;
      try {
        for await (const _chunk of provider.stream({
          messages: [{content: 'test', role: 'user'}],
          model: 'gpt-4-turbo',
        })) {
          void _chunk;
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('ENDPOINT');
    } finally {
      if (originalEndpoint) process.env.AZURE_OPENAI_ENDPOINT = originalEndpoint;
      delete process.env.AZURE_OPENAI_API_KEY;
    }
  });

  it('requires AZURE_OPENAI_DEPLOYMENT to be set', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    const originalDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    try {
      delete process.env.AZURE_OPENAI_DEPLOYMENT;
      const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
      const provider = new AzureOpenAIProvider();

      let error: Error | undefined;
      try {
        for await (const _chunk of provider.stream({
          messages: [{content: 'test', role: 'user'}],
          model: 'gpt-4-turbo',
        })) {
          void _chunk;
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('DEPLOYMENT');
    } finally {
      if (originalDeployment) process.env.AZURE_OPENAI_DEPLOYMENT = originalDeployment;
      delete process.env.AZURE_OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_ENDPOINT;
    }
  });

  it('advertises streaming and tool calling', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4-turbo';

    const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
    const provider = new AzureOpenAIProvider();

    expect(provider.supportsStreaming).toBe(true);
    expect(provider.supportsToolCalling).toBe(true);
    expect(provider.nativeToolFormat).toBe('openai');

    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
  });

  it('uses deployment from environment', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'my-deployment';

    const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
    const provider = new AzureOpenAIProvider();

    const models = await provider.listModels();
    expect(models).toContain('my-deployment');

    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
  });

  it('uses custom API version if provided', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4-turbo';
    process.env.AZURE_OPENAI_API_VERSION = '2024-02-01';

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: [DONE]\n'),
            })
            .mockResolvedValueOnce({
              done: true,
              value: undefined,
            }),
          releaseLock: vi.fn(),
        }),
      },
    });

    global.fetch = fetchMock;

    const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
    const provider = new AzureOpenAIProvider();

    for await (const _chunk of provider.stream({
      messages: [{content: 'test', role: 'user'}],
      model: 'gpt-4-turbo',
    })) {
      void _chunk;
    }

    expect(fetchMock).toHaveBeenCalled();
    const callUrl = (fetchMock.mock.calls[0] as unknown[])?.[0];
    if (typeof callUrl === 'string') {
      expect(callUrl).toContain('2024-02-01');
    }

    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    delete process.env.AZURE_OPENAI_API_VERSION;
  });

  it('no real network calls in tests', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com/';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4-turbo';

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    global.fetch = fetchMock;

    const {AzureOpenAIProvider} = await import('../../src/providers/azure.js');
    const provider = new AzureOpenAIProvider();

    try {
      for await (const _chunk of provider.stream({
        messages: [{content: 'test', role: 'user'}],
        model: 'gpt-4-turbo',
      })) {
        void _chunk;
      }
    } catch {
      // expected
    }

    expect(fetchMock).toHaveBeenCalled();
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
  });
});
