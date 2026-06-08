import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {checkMcpToolPermission} from '../../src/mcp/permissions.js';
import {buildMcpToolDefinitions, buildMcpToolName} from '../../src/mcp/tools.js';
import {FileMcpTokenStore, getMcpAuthStatus, refreshMcpOAuthToken, startMcpDeviceFlow} from '../../src/mcp/auth/index.js';
import type {McpClientV2} from '../../src/mcp/clientV2.js';
import type {McpServerConfig} from '../../src/mcp/serverConfig.js';

const config = (overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
  enabled: true,
  id: 'srv',
  name: 'Server',
  transport: 'http',
  trustLevel: 'low',
  url: 'https://mcp.example/rpc',
  ...overrides,
});

describe('MCP hardening', () => {
  it('uses mcp:server.tool names for ToolRegistry registration', () => {
    expect(buildMcpToolName('github', 'list_issues')).toBe('mcp:github.list_issues');
  });

  it('enforces deny precedence and low-trust risky-tool blocks', () => {
    expect(checkMcpToolPermission(config({allowedTools: ['delete_file'], deniedTools: ['delete_file'], trustLevel: 'high'}), 'delete_file').allowed).toBe(false);
    const risky = checkMcpToolPermission(config(), 'create_issue');
    expect(risky.allowed).toBe(false);
    expect(risky.requiresApproval).toBe(true);
    expect(checkMcpToolPermission(config(), 'list_issues').allowed).toBe(true);
  });

  it('prevents ToolRegistry execution from bypassing MCP permissions', async () => {
    const client = {
      callTool: () => Promise.resolve({content: [{text: 'should not run', type: 'text' as const}]}),
    } as unknown as McpClientV2;
    const [tool] = buildMcpToolDefinitions({
      client,
      config: config({deniedTools: ['delete_file'], trustLevel: 'high'}),
      tools: [{description: 'delete', inputSchema: {type: 'object'}, name: 'delete_file'}],
    });
    const result = await tool!.run({}, {approvalManager: {}, config: {}, cwd: process.cwd()} as never);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('blocked');
  });

  it('stores auth status without exposing token values', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-mcp-auth-'));
    const store = new FileMcpTokenStore(dir);
    await store.set('srv', {accessToken: 'secret-access-token', expiresAt: Date.now() + 60_000, refreshToken: 'secret-refresh-token', tokenType: 'Bearer'});
    const token = await store.get('srv');
    expect(getMcpAuthStatus(token)).toBe('authenticated');
    await store.clear('srv');
    expect(getMcpAuthStatus(await store.get('srv'))).toBe('missing');
  });

  it('supports mocked OAuth refresh and device authorization', async () => {
    const fetchImpl = (url: string | URL | Request) => {
      const text = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (text.includes('device')) {
        return Promise.resolve(new Response(JSON.stringify({device_code: 'dev', user_code: 'ABC', verification_uri: 'https://verify', expires_in: 60}), {status: 200}));
      }
      return Promise.resolve(new Response(JSON.stringify({access_token: 'new-token', expires_in: 60, refresh_token: 'refresh'}), {status: 200}));
    };
    const oauth = {clientId: 'client', deviceAuthorizationEndpoint: 'https://auth/device', tokenEndpoint: 'https://auth/token'};
    expect((await startMcpDeviceFlow(oauth, {fetchImpl})).userCode).toBe('ABC');
    expect((await refreshMcpOAuthToken(oauth, 'old-refresh', {fetchImpl})).accessToken).toBe('new-token');
  });
});
