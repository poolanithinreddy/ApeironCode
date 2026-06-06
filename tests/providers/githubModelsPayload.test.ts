import {afterEach, describe, expect, it, vi} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import {
  buildChatRequestBody,
  buildProviderBadRequestError,
  sanitizeGitHubTools,
} from '../../src/providers/openaiCompatible.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

const TOKEN = 'github_pat_11SECRETpayloadTokenDoNotLeak1234567890';

describe('buildChatRequestBody (GitHub Models normalizer)', () => {
  it('produces the minimal working curl shape for pure chat (no tools)', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [
          {role: 'system', content: 'You are helpful.'},
          {role: 'user', content: 'hi'},
        ],
        stream: false,
      },
      'github-models',
    );
    expect(body).toEqual({
      model: 'openai/gpt-4.1',
      messages: [
        {role: 'system', content: 'You are helpful.'},
        {role: 'user', content: 'hi'},
      ],
      stream: false,
      temperature: 0.2,
    });
    expect('tools' in body).toBe(false);
  });

  it('drops empty/placeholder assistant turns and coerces unknown roles', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [
          {role: 'tool', content: 'tool output'},
          {role: 'assistant', content: '▊'},
          {role: 'assistant', content: '   '},
          {role: 'user', content: 'go'},
        ],
        stream: true,
      },
      'github-models',
    );
    expect(body.messages).toEqual([
      {role: 'user', content: 'tool output'},
      {role: 'user', content: 'go'},
    ]);
  });

  it('includes GitHub-compatible function tools when tools are provided', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [{role: 'user', content: 'list files'}],
        stream: false,
        tools: [
          {name: 'read_file', description: 'Read a file', input_schema: {type: 'object', properties: {}}},
        ],
      },
      'github-models',
    );
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools?.[0]).toEqual({
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: {type: 'object', properties: {}, required: []},
      },
    });
  });
});

describe('buildChatRequestBody (OpenAI-compatible tool schemas)', () => {
  it('sanitizes tools for OpenAI, not only GitHub Models', () => {
    const registry = createDefaultToolRegistry();
    const body = buildChatRequestBody(
      {
        model: 'gpt-4o',
        messages: [{role: 'user', content: 'edit a file'}],
        stream: true,
        tools: registry.getProviderToolDefinitionsFor(['revert_patch', 'package_info']),
      },
      'openai',
    );
    expect(body.tools).toHaveLength(2);
    const params = body.tools?.map((tool) => (tool as {function: {parameters: Record<string, unknown>}}).function.parameters);
    expect(params).toEqual([
      {type: 'object', properties: {}, required: []},
      {type: 'object', properties: {}, required: []},
    ]);
  });

  it('drops invalid function names before provider send', () => {
    const body = buildChatRequestBody(
      {
        model: 'gpt-4o',
        messages: [{role: 'user', content: 'do work'}],
        stream: true,
        tools: [
          {name: 'valid_tool', description: 'v', input_schema: {type: 'object'}},
          {name: 'bad name', description: 'bad', input_schema: {type: 'object'}},
        ],
      },
      'openai',
    );
    const names = body.tools?.map((tool) => (tool as {function: {name: string}}).function.name);
    expect(names).toEqual(['valid_tool']);
  });
});

describe('sanitizeGitHubTools', () => {
  it('fixes a package_info-style schema missing properties', () => {
    const out = sanitizeGitHubTools([
      {type: 'function', function: {name: 'package_info', description: 'pkg', parameters: {type: 'object'}}},
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.function.parameters).toEqual({type: 'object', properties: {}, required: []});
  });

  it('fills entirely missing parameters and strips unsupported metadata', () => {
    const out = sanitizeGitHubTools([
      {type: 'function', function: {name: 'project_tree', description: 'tree'}},
      {type: 'function', function: {name: 'x', description: 'd', parameters: {type: 'object', properties: {}, $schema: 'http://json-schema.org/draft-07/schema#', $defs: {}}}},
    ]);
    expect(out[0]!.function.parameters).toEqual({type: 'object', properties: {}, required: []});
    const p = out[1]!.function.parameters as Record<string, unknown>;
    expect(p.$schema).toBeUndefined();
    expect(p.$defs).toBeUndefined();
  });

  it('drops tools whose parameters are non-object or unnamed', () => {
    const out = sanitizeGitHubTools([
      {type: 'function', function: {name: 'bad', description: 'd', parameters: {type: 'string'}}},
      {type: 'function', function: {description: 'no name'}},
      {nonsense: true},
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('pure chat sends zero tools (GitHub Models)', () => {
  for (const prompt of ['hi', 'hello', 'what can you do?', 'who are you?']) {
    it(`"${prompt}" omits tools and tool_choice`, () => {
      const body = buildChatRequestBody(
        {
          model: 'openai/gpt-4.1',
          messages: [{role: 'user', content: prompt}],
          stream: true,
          tools: [{name: 'read_file', description: 'r', input_schema: {type: 'object', properties: {}}}],
        },
        'github-models',
      );
      expect('tools' in body).toBe(false);
      expect('tool_choice' in body).toBe(false);
      expect(body.messages).toEqual([{role: 'user', content: prompt}]);
    });
  }

  it('forceNoTools drops tools even for a non-chat prompt', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [{role: 'user', content: 'edit the readme title'}],
        stream: true,
        tools: [{name: 'edit_file', description: 'e', input_schema: {type: 'object', properties: {}}}],
      },
      'github-models',
      {forceNoTools: true},
    );
    expect('tools' in body).toBe(false);
  });
});

describe('buildProviderBadRequestError (safe 400 diagnostics)', () => {
  it('extracts only safe fields and never leaks the body/token/prompt', () => {
    const err = buildProviderBadRequestError(
      'GitHub Models',
      400,
      JSON.stringify({error: {message: 'Unsupported parameter: max_completion_tokens', code: 'invalid_request', param: 'max_completion_tokens'}}),
    );
    expect(err.code).toBe('PROVIDER_BAD_REQUEST');
    expect(err.message).toContain('rejected the request payload (400)');
    expect(err.message).toContain('Unsupported parameter');
    expect(err.message).toContain('field: max_completion_tokens');
    expect(err.message).not.toContain(TOKEN);
  });

  it('uses a concise invalid tool schema diagnostic', () => {
    const err = buildProviderBadRequestError(
      'OpenAI',
      400,
      JSON.stringify({error: {message: "Invalid schema for function 'revert_patch': object schema missing properties", param: 'tools[7].function.parameters'}}),
    );
    expect(err.message).toBe('OpenAI rejected a tool schema: revert_patch. ApeironCode will retry without tools when safe.');
    expect(err.message).not.toContain('tools[7]');
    expect(err.message).not.toContain(TOKEN);
  });

  it('falls back to a generic safe message for non-JSON bodies', () => {
    const err = buildProviderBadRequestError('GitHub Models', 422, '<html>nope</html>');
    expect(err.message).toContain('non-JSON 422 response');
  });
});

describe('GitHub Models provider 400 handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('fails fast with a clear payload-too-large error and sends no request', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    const huge = 'x'.repeat(200_000);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: huge, role: 'user'}],
        model: 'openai/gpt-4.1',
      })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }
    expect((caught as {code?: string}).code).toBe('PROVIDER_PAYLOAD_TOO_LARGE');
    expect((caught as Error).message).toContain('payload too large');
    expect((caught as Error).message).not.toContain(TOKEN);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a 413 response to a clear payload error without retrying', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(`too big ${TOKEN}`, {status: 413})));
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: 'hello there friend', role: 'user'}],
        model: 'openai/gpt-4.1',
      })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }
    expect((caught as {code?: string}).code).toBe('PROVIDER_PAYLOAD_TOO_LARGE');
    expect((caught as Error).message).not.toContain(TOKEN);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('maps a streaming 400 to a safe error after a non-stream retry also fails', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({error: {message: 'bad model'}}), {status: 400}),
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: 'hi', role: 'user'}],
        model: 'openai/gpt-4.1',
      })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }
    expect((caught as {code?: string}).code).toBe('PROVIDER_BAD_REQUEST');
    expect((caught as Error).message).toContain('bad model');
    expect((caught as Error).message).not.toContain(TOKEN);
    // streaming attempt + one non-streaming fallback retry only.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries without tools when a tool schema is rejected, then succeeds', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const bodies: string[] = [];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: {body: string}) => {
        call += 1;
        bodies.push(init.body);
        if (call === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({error: {message: "Invalid schema for function 'package_info': object schema missing properties"}}),
              {status: 400},
            ),
          );
        }
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: {'content-type': 'text/event-stream'},
          }),
        );
      }),
    );
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let text = '';
    for await (const chunk of provider.stream({
      messages: [{content: 'do a thing', role: 'user'}],
      model: 'openai/gpt-4.1',
      tools: [{name: 'package_info', description: 'p', input_schema: {type: 'object'}}],
    })) {
      if (chunk.type === 'token') text += chunk.token ?? '';
    }
    expect(text).toBe('hello');
    expect(call).toBe(2);
    const first = JSON.parse(bodies[0]!) as Record<string, unknown>;
    const second = JSON.parse(bodies[1]!) as Record<string, unknown>;
    expect(first.tools).toBeDefined();
    expect('tools' in second).toBe(false);
  });

  it('recovers via non-streaming fallback when streaming is rejected', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(new Response('{"error":{"message":"stream unsupported"}}', {status: 400}));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({choices: [{message: {content: 'Hello there!'}}], usage: {}}),
            {status: 200, headers: {'content-type': 'application/json'}},
          ),
        );
      }),
    );
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let text = '';
    for await (const chunk of provider.stream({
      messages: [{content: 'hi', role: 'user'}],
      model: 'openai/gpt-4.1',
    })) {
      if (chunk.type === 'token') text += chunk.token ?? '';
    }
    expect(text).toBe('Hello there!');
  });
});

describe('OpenAI provider tool schema handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('never sends missing-properties function parameters to OpenAI fetch', async () => {
    process.env.OPENAI_API_KEY = TOKEN;
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: {body: string}) => {
        bodies.push(init.body);
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: {'content-type': 'text/event-stream'},
          }),
        );
      }),
    );
    const provider = new ProviderRegistry().create('openai', DEFAULT_CONFIG);
    for await (const chunk of provider.stream({
      messages: [{content: 'edit a thing', role: 'user'}],
      model: 'gpt-4o',
      tools: [{name: 'revert_patch', description: 'r', input_schema: {type: 'object'}}],
    })) {
      void chunk;
    }
    const body = JSON.parse(bodies[0]!) as {tools?: Array<{function: {parameters: Record<string, unknown>}}>};
    expect(body.tools?.[0]?.function.parameters).toEqual({type: 'object', properties: {}, required: []});
  });

  it('retries schema rejection once without tools for OpenAI-compatible providers', async () => {
    process.env.OPENAI_API_KEY = TOKEN;
    const bodies: string[] = [];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: {body: string}) => {
        call += 1;
        bodies.push(init.body);
        if (call === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({error: {message: "Invalid schema for function 'revert_patch': object schema missing properties"}}),
              {status: 400},
            ),
          );
        }
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: {'content-type': 'text/event-stream'},
          }),
        );
      }),
    );
    const provider = new ProviderRegistry().create('openai', DEFAULT_CONFIG);
    let text = '';
    for await (const chunk of provider.stream({
      messages: [{content: 'edit a thing', role: 'user'}],
      model: 'gpt-4o',
      tools: [{name: 'revert_patch', description: 'r', input_schema: {type: 'object'}}],
    })) {
      if (chunk.type === 'token') text += chunk.token ?? '';
    }
    expect(text).toBe('ok');
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0]!) as Record<string, unknown>).toHaveProperty('tools');
    expect('tools' in (JSON.parse(bodies[1]!) as Record<string, unknown>)).toBe(false);
  });
});
