import {describe, expect, it, vi} from 'vitest';

describe('GeminiProvider', () => {
  it('requires GEMINI_API_KEY to be set', async () => {
    const {GeminiProvider} = await import('../../src/providers/gemini.js');
    const provider = new GeminiProvider('https://api.example.com', null);

    let error: Error | undefined;
    try {
      for await (const _chunk of provider.stream({
        messages: [{content: 'test', role: 'user'}],
        model: 'gemini-2.5-flash',
      })) {
        void _chunk;
      }
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('GEMINI_API_KEY');
  });

  it('advertises tool calling support', async () => {
    const {GeminiProvider} = await import('../../src/providers/gemini.js');
    const provider = new GeminiProvider('https://api.example.com', 'test-key');

    expect(provider.supportsToolCalling).toBe(true);
    expect(provider.nativeToolFormat).toBe('openai');
  });

  it('lists available models', async () => {
    const {GeminiProvider} = await import('../../src/providers/gemini.js');
    const provider = new GeminiProvider('https://api.example.com', 'test-key');

    const models = await provider.listModels();
    expect(models).toContain('gemini-2.5-pro');
    expect(models).toContain('gemini-2.5-flash');
  });

  it('emits token chunks', async () => {
    const {GeminiProvider} = await import('../../src/providers/gemini.js');
    const provider = new GeminiProvider('https://api.example.com', 'test-key');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('{"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n'),
            })
            .mockResolvedValueOnce({
              done: true,
              value: undefined,
            }),
          releaseLock: vi.fn(),
        }),
      },
    });

    const chunks: string[] = [];
    for await (const chunk of provider.stream({
      messages: [{content: 'test', role: 'user'}],
      model: 'gemini-2.5-flash',
    })) {
      if (chunk.type === 'token') {
        chunks.push(chunk.token ?? '');
      }
    }

    expect(chunks.join('')).toContain('hello');
  });

  it('emits done chunk with usage', async () => {
    const {GeminiProvider} = await import('../../src/providers/gemini.js');
    const provider = new GeminiProvider('https://api.example.com', 'test-key');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('{"candidates":[{"content":{"parts":[{"text":"test"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}\n'),
            })
            .mockResolvedValueOnce({
              done: true,
              value: undefined,
            }),
          releaseLock: vi.fn(),
        }),
      },
    });

    let doneChunk;
    for await (const chunk of provider.stream({
      messages: [{content: 'test', role: 'user'}],
      model: 'gemini-2.5-flash',
    })) {
      if (chunk.type === 'done') {
        doneChunk = chunk;
      }
    }

    expect(doneChunk).toBeDefined();
    expect(doneChunk?.usage?.inputTokens).toBe(10);
    expect(doneChunk?.usage?.outputTokens).toBe(5);
  });
});
