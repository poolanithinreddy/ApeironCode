import type {PluginMcpServer} from '../plugins/types.js';
import {FileMcpTokenStore, getMcpAuthStatus, type McpAuthStatus, type McpTokenStore} from '../mcp/auth/index.js';
import type {DoctorCheck} from './doctor.js';

export interface McpDoctorEndpointInput {
  permissions?: {allowedTools?: string[]; deniedTools?: string[]; trustLevel?: string};
  serverId: string;
  spec: PluginMcpServer;
}

export interface McpDoctorOptions {
  endpoints: McpDoctorEndpointInput[];
  online?: boolean;
  store?: McpTokenStore;
}

const describeAuthStatus = (status: McpAuthStatus): {detail: string; status: DoctorCheck['status']} => {
  switch (status) {
    case 'authenticated':
      return {detail: 'authenticated', status: 'pass'};
    case 'expired':
      return {detail: 'expired (no refresh token; reauthorize)', status: 'warn'};
    case 'refresh_available':
      return {detail: 'expired but refreshable', status: 'warn'};
    default:
      return {detail: 'no token (login required for protected servers)', status: 'warn'};
  }
};

const validateTransport = (spec: PluginMcpServer): {detail: string; fix?: string; status: DoctorCheck['status']} => {
  if (spec.type === 'stdio') {
    if (!spec.command || !spec.command.trim()) {
      return {detail: 'stdio: missing command', fix: 'Set the stdio command in plugin manifest.', status: 'fail'};
    }
    return {detail: `stdio: ${spec.command}`, status: 'pass'};
  }
  if (spec.type === 'http' || spec.type === 'sse') {
    try {
      const url = new URL(spec.url);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return {detail: `${spec.type}: ${url.origin} (insecure)`, fix: 'Use HTTPS for non-local MCP servers.', status: 'warn'};
      }
      return {detail: `${spec.type}: ${url.origin}`, status: 'pass'};
    } catch {
      return {detail: `${spec.type}: invalid URL`, fix: 'Fix the MCP server URL in your config.', status: 'fail'};
    }
  }
  return {detail: 'unknown transport', status: 'fail'};
};

const summarizePermissions = (permissions?: McpDoctorEndpointInput['permissions']): string => {
  if (!permissions) return 'no overrides';
  const trust = permissions.trustLevel ?? 'low';
  const allow = permissions.allowedTools?.length ?? 0;
  const deny = permissions.deniedTools?.length ?? 0;
  return `trust=${trust}, allow=${allow}, deny=${deny}`;
};

export const buildMcpDoctorChecks = async (options: McpDoctorOptions): Promise<DoctorCheck[]> => {
  const store = options.store ?? new FileMcpTokenStore();
  const checks: DoctorCheck[] = [];

  if (options.endpoints.length === 0) {
    checks.push({detail: 'No MCP endpoints configured', label: 'MCP endpoints', status: 'pass'});
    return checks;
  }

  for (const endpoint of options.endpoints) {
    const transport = validateTransport(endpoint.spec);
    checks.push({
      detail: transport.detail,
      fix: transport.fix,
      label: `MCP transport: ${endpoint.serverId}`,
      status: transport.status,
    });

    const token = await store.get(endpoint.serverId).catch(() => null);
    const status = getMcpAuthStatus(token);
    const description = describeAuthStatus(status);
    checks.push({
      detail: description.detail,
      label: `MCP auth: ${endpoint.serverId}`,
      status: description.status,
    });

    checks.push({
      detail: summarizePermissions(endpoint.permissions),
      label: `MCP permissions: ${endpoint.serverId}`,
      status: 'pass',
    });
  }

  return checks;
};
