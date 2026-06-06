import {describe, expect, it, vi} from 'vitest';
import {discoverMcpOAuthMetadata} from '../../src/mcp/auth/metadata.js';
import {ensureMcpAuthToken, runMcpDeviceLogin} from '../../src/mcp/auth/login.js';
import {getMcpAuthStatus} from '../../src/mcp/auth/tokenStore.js';
import type {McpAuthToken, McpTokenStore} from '../../src/mcp/auth/types.js';

const buildResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}, status});

const memoryStore = (initial?: McpAuthToken): McpTokenStore => {
  let token: McpAuthToken | null = initial ?? null;
  return {
    get: () => Promise.resolve(token),
    set: (_id: string, t: McpAuthToken) => {
      token = t;
      return Promise.resolve();
    },
    clear: () => {
      token = null;
      return Promise.resolve();
    },
  };
};

describe('discoverMcpOAuthMetadata', () => {
  it('finds token endpoint via well-known metadata', async () => {
    const fetchImpl = vi.fn((url: string): Promise<Response> => {
      if (url.endsWith('/.well-known/oauth-protected-resource')) {
        return Promise.resolve(buildResponse({authorization_servers: ['https://auth.example']}));
      }
      if (url.endsWith('/.well-known/oauth-authorization-server')) {
        return Promise.resolve(buildResponse({
          authorization_endpoint: 'https://auth.example/auth',
          device_authorization_endpoint: 'https://auth.example/device',
          scopes_supported: ['mcp:read'],
          token_endpoint: 'https://auth.example/token',
        }));
      }
      return Promise.resolve(new Response('', {status: 404}));
    });
    const config = await discoverMcpOAuthMetadata({clientId: 'opencode-agent', fetchImpl: fetchImpl as typeof fetch, resourceUrl: 'https://server.example'});
    expect(config.tokenEndpoint).toBe('https://auth.example/token');
    expect(config.deviceAuthorizationEndpoint).toBe('https://auth.example/device');
  });

  it('throws when token endpoint missing', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(buildResponse({})));
    await expect(discoverMcpOAuthMetadata({clientId: 'x', fetchImpl, resourceUrl: 'https://server.example'}))
      .rejects.toThrow();
  });
});

describe('runMcpDeviceLogin (mocked)', () => {
  it('completes device flow and stores token', async () => {
    const oauthConfig = {
      clientId: 'opencode-agent',
      deviceAuthorizationEndpoint: 'https://auth.example/device',
      tokenEndpoint: 'https://auth.example/token',
    };
    let pollCount = 0;
    const fetchImpl = vi.fn((url: string): Promise<Response> => {
      if (url === oauthConfig.deviceAuthorizationEndpoint) {
        return Promise.resolve(buildResponse({device_code: 'dev123', user_code: 'ABCD-1234', verification_uri: 'https://auth.example/verify', interval: 1, expires_in: 60}));
      }
      if (url === oauthConfig.tokenEndpoint) {
        pollCount += 1;
        if (pollCount < 2) {
          return Promise.resolve(buildResponse({error: 'authorization_pending'}, 400));
        }
        return Promise.resolve(buildResponse({access_token: 'abc.def', refresh_token: 'rfr', token_type: 'Bearer', expires_in: 3600}));
      }
      return Promise.resolve(new Response('', {status: 404}));
    });
    const store = memoryStore();
    const onUserPrompt = vi.fn();
    const token = await runMcpDeviceLogin({
      fetchImpl: fetchImpl as typeof fetch,
      oauthConfig,
      onUserPrompt,
      pollAttempts: 5,
      serverId: 'srv',
      sleep: () => Promise.resolve(),
      store,
    });
    expect(token.accessToken).toBe('abc.def');
    expect(onUserPrompt).toHaveBeenCalled();
    expect(await store.get('srv')).not.toBeNull();
  });
});

describe('ensureMcpAuthToken', () => {
  it('returns missing when no token stored', async () => {
    const result = await ensureMcpAuthToken({serverId: 'srv', store: memoryStore()});
    expect(result.status).toBe('missing');
  });

  it('returns authenticated for valid token', async () => {
    const token: McpAuthToken = {accessToken: 'a', expiresAt: Date.now() + 60_000, tokenType: 'Bearer'};
    const result = await ensureMcpAuthToken({serverId: 'srv', store: memoryStore(token)});
    expect(result.status).toBe('authenticated');
    expect(result.token).toEqual(token);
  });

  it('refreshes when refresh token available', async () => {
    const expired: McpAuthToken = {accessToken: 'old', expiresAt: Date.now() - 1_000, refreshToken: 'rfr', tokenType: 'Bearer'};
    const fetchImpl = vi.fn(() => Promise.resolve(buildResponse({access_token: 'new', expires_in: 600, token_type: 'Bearer'})));
    const result = await ensureMcpAuthToken({
      fetchImpl,
      oauthConfig: {clientId: 'x', tokenEndpoint: 'https://auth.example/token'},
      serverId: 'srv',
      store: memoryStore(expired),
    });
    expect(result.status).toBe('authenticated');
    expect(result.token?.accessToken).toBe('new');
  });

  it('classifies expired without refresh', () => {
    const token: McpAuthToken = {accessToken: 'a', expiresAt: 100, tokenType: 'Bearer'};
    expect(getMcpAuthStatus(token, 1_000_000)).toBe('expired');
  });

  it('logout clears token', async () => {
    const store = memoryStore({accessToken: 'a', tokenType: 'Bearer'});
    await store.clear('srv');
    expect(await store.get('srv')).toBeNull();
  });
});
