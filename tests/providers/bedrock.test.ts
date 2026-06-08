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

  it('signs requests with maintained SigV4 (Authorization + X-Amz-Date) for the bedrock service', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIDEXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-value';
    process.env.AWS_REGION = 'us-west-2';

    let captured: {url: string; headers: Record<string, string>} | undefined;
    const fetchMock = vi.fn().mockImplementation((url: string, init: {headers: Record<string, string>}) => {
      captured = {url, headers: init.headers};
      return Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('stop'),
      });
    });
    global.fetch = fetchMock;

    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();

    try {
      for await (const _chunk of provider.stream({
        messages: [{content: 'hello', role: 'user'}],
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      })) {
        void _chunk;
      }
    } catch {
      // expected: mocked 400
    }

    expect(captured).toBeDefined();
    const headers = captured!.headers;
    const auth = headers.Authorization ?? headers.authorization;
    expect(auth).toBeDefined();
    // Maintained aws4 signer output: algorithm + credential scope + signature.
    expect(auth).toContain('AWS4-HMAC-SHA256');
    expect(auth).toContain('AKIDEXAMPLE');
    expect(auth).toContain('us-west-2/bedrock/aws4_request');
    expect(auth).toContain('Signature=');
    expect(headers['X-Amz-Date'] ?? headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/u);
    expect(captured!.url).toBe(
      'https://bedrock-runtime.us-west-2.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2:0/converse-stream',
    );

    // The raw secret must never be embedded in any outgoing header.
    for (const value of Object.values(headers)) {
      expect(value).not.toContain('super-secret-value');
    }

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  });

  it('includes the session token header when AWS_SESSION_TOKEN is set', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIDEXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-value';
    process.env.AWS_SESSION_TOKEN = 'session-token-value';

    let captured: Record<string, string> | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init: {headers: Record<string, string>}) => {
      captured = init.headers;
      return Promise.resolve({ok: false, status: 400, text: () => Promise.resolve('stop')});
    });

    const {BedrockProvider} = await import('../../src/providers/bedrock.js');
    const provider = new BedrockProvider();
    try {
      for await (const _chunk of provider.stream({
        messages: [{content: 'hi', role: 'user'}],
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      })) {
        void _chunk;
      }
    } catch {
      // expected
    }

    expect(captured).toBeDefined();
    const tokenHeader = captured!['X-Amz-Security-Token'] ?? captured!['x-amz-security-token'];
    expect(tokenHeader).toBe('session-token-value');

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
  });

  it('produces a clean, secret-free error when credentials are missing', async () => {
    const originalId = process.env.AWS_ACCESS_KEY_ID;
    const originalSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
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
    // Clean, actionable error naming the required env vars (not their values).
    expect(error?.message).toContain('AWS_ACCESS_KEY_ID');
    expect(error?.message).toContain('AWS_SECRET_ACCESS_KEY');
    expect((error as {code?: string} | undefined)?.code).toBe('PROVIDER_NOT_CONFIGURED');

    if (originalId) process.env.AWS_ACCESS_KEY_ID = originalId;
    if (originalSecret) process.env.AWS_SECRET_ACCESS_KEY = originalSecret;
  });
});
