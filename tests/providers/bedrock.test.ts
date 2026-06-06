import {describe, expect, it, vi} from 'vitest';

describe('BedrockProvider', () => {
  it('requires AWS credentials to be set', async () => {
    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();

    let error: Error | undefined;
    try {
      for await (const _chunk of provider.stream({
        messages: [{content: 'test', role: 'user'}],
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      })) {
        void _chunk;
      }
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('AWS');
  });

  it('requires AWS_SECRET_ACCESS_KEY to be set', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    const originalSecret = process.env.AWS_SECRET_ACCESS_KEY;
    try {
      delete process.env.AWS_SECRET_ACCESS_KEY;
      const {BedrockProvider} = await import('../../src/providers/bedrock.js');
      const provider = new BedrockProvider();

      let error: Error | undefined;
      try {
        for await (const _chunk of provider.stream({
          messages: [{content: 'test', role: 'user'}],
          model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        })) {
          void _chunk;
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('SECRET');
    } finally {
      if (originalSecret) process.env.AWS_SECRET_ACCESS_KEY = originalSecret;
      delete process.env.AWS_ACCESS_KEY_ID;
    }
  });

  it('advertises streaming and tool calling', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();

    expect(provider.supportsStreaming).toBe(true);
    expect(provider.supportsToolCalling).toBe(true);
    expect(provider.nativeToolFormat).toBe('anthropic');

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  it('lists available models', async () => {
    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();

    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toContain('claude');
  });

  it('handles missing AWS region gracefully', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    const originalRegion = process.env.AWS_REGION;
    try {
      delete process.env.AWS_REGION;
      const {BedrockProvider} = await import('../../src/providers/bedrock.js');
      const provider = new BedrockProvider();

      expect(provider.name).toBe('bedrock');
    } finally {
      if (originalRegion) process.env.AWS_REGION = originalRegion;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it('no real network calls in tests', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    global.fetch = fetchMock;

    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();

    try {
      const generator = provider.stream({
        messages: [{content: 'test', role: 'user'}],
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });

      for await (const chunk of generator) {
        void chunk;
      }
    } catch {
      // expected to fail
    }

    expect(fetchMock).toHaveBeenCalled();
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });
});
