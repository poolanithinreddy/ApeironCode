import {afterEach, describe, expect, it, vi} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ProviderRegistry} from '../../src/providers/registry.js';

const TOKEN = 'github_pat_11SECRETdoNotLeakThisTokenValue1234567890';

const streamFirstError = async (
  provider: ReturnType<ProviderRegistry['create']>,
): Promise<unknown> => {
  try {
    for await (const chunk of provider.stream({
      messages: [{content: 'hi', role: 'user'}],
      model: 'openai/gpt-4.1',
      temperature: 0,
    })) {
      void chunk; // not reached on auth failure
    }
    return null;
  } catch (error) {
    return error;
  }
};

describe('GitHub Models auth wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('sends Authorization bearer + X-GitHub-Api-Version to the correct endpoint', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: {headers: Record<string, string>}) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('{"error":"bad"}', {status: 401}));
      }),
    );

    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    await streamFirstError(provider);

    expect(capturedUrl).toBe('https://models.github.ai/inference/chat/completions');
    expect(capturedHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(capturedHeaders['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('maps 401 to a clean auth error without leaking the token or body', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(`unauthorized ${TOKEN}`, {status: 401}))),
    );

    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    const error = await streamFirstError(provider);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect((error as {code?: string}).code).toBe('PROVIDER_AUTH_ERROR');
    expect(message).toContain('authentication failed');
    expect(message).toContain('Models: Read');
    expect(message).toContain('doctor --strict');
    expect(message).not.toContain(TOKEN);
  });

  it('gives a clean missing-token error when GITHUB_TOKEN is absent', async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    const error = await streamFirstError(provider);

    expect(error).toBeInstanceOf(Error);
    expect((error as {code?: string}).code).toBe('PROVIDER_AUTH_ERROR');
    expect((error as Error).message).toContain('GITHUB_TOKEN is not set');
    // Fail fast: no network call attempted when the key is missing.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
