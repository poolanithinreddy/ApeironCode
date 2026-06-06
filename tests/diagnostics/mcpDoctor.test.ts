import {describe, expect, it} from 'vitest';
import {buildMcpDoctorChecks} from '../../src/diagnostics/mcpDoctor.js';
import type {McpAuthToken, McpTokenStore} from '../../src/mcp/auth/types.js';

const memoryStore = (token: McpAuthToken | null = null): McpTokenStore => ({
  clear: () => Promise.resolve(),
  get: () => Promise.resolve(token),
  set: () => Promise.resolve(),
});

describe('buildMcpDoctorChecks', () => {
  it('reports no endpoints when none configured', async () => {
    const checks = await buildMcpDoctorChecks({endpoints: []});
    expect(checks).toHaveLength(1);
    expect(checks[0]?.status).toBe('pass');
    expect(checks[0]?.detail).toContain('No MCP endpoints');
  });

  it('reports missing auth token as warn', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http', url: 'https://example.com', name: 'srv', headers: {}}}],
      store: memoryStore(null),
    });
    expect(checks.some((c) => c.label === 'MCP auth: srv' && c.status === 'warn')).toBe(true);
  });

  it('reports authenticated when token valid', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http', url: 'https://example.com', name: 'srv', headers: {}}}],
      store: memoryStore({accessToken: 'abc.secret', expiresAt: Date.now() + 60_000, tokenType: 'Bearer'}),
    });
    const auth = checks.find((c) => c.label === 'MCP auth: srv');
    expect(auth?.status).toBe('pass');
    expect(auth?.detail).not.toContain('abc.secret');
  });

  it('flags expired token without refresh as warn', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http', url: 'https://example.com', name: 'srv', headers: {}}}],
      store: memoryStore({accessToken: 'abc', expiresAt: 100, tokenType: 'Bearer'}),
    });
    const auth = checks.find((c) => c.label === 'MCP auth: srv');
    expect(auth?.status).toBe('warn');
  });

  it('reports invalid URL as fail', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http' as const, url: 'not a url', name: 'srv', headers: {}}}],
      store: memoryStore(),
    });
    const transport = checks.find((c) => c.label === 'MCP transport: srv');
    expect(transport?.status).toBe('fail');
  });

  it('flags non-https URL as warn', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http' as const, url: 'http://example.com', name: 'srv', headers: {}}}],
      store: memoryStore(),
    });
    const transport = checks.find((c) => c.label === 'MCP transport: srv');
    expect(transport?.status).toBe('warn');
  });

  it('shows permission summary', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{
        permissions: {allowedTools: ['a'], deniedTools: ['b'], trustLevel: 'medium'},
        serverId: 'srv',
        spec: {type: 'stdio', command: 'node', args: [], env: {}, name: 'srv'},
      }],
      store: memoryStore(),
    });
    const perms = checks.find((c) => c.label === 'MCP permissions: srv');
    expect(perms?.detail).toContain('trust=medium');
    expect(perms?.detail).toContain('allow=1');
  });

  it('does not print token values anywhere in detail strings', async () => {
    const token: McpAuthToken = {accessToken: 'super-secret-token-xyz', refreshToken: 'rfr-secret', tokenType: 'Bearer'};
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'srv', spec: {type: 'http', url: 'https://example.com', name: 'srv', headers: {}}}],
      store: memoryStore(token),
    });
    for (const c of checks) {
      expect(c.detail).not.toContain(token.accessToken);
      expect(c.detail).not.toContain(token.refreshToken!);
    }
  });
});
