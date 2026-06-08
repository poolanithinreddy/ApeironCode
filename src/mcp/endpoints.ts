import type {ApeironCodeConfig} from '../config/config.js';
import {listPluginMcpEndpoints} from '../plugins/mcp.js';
import type {LoadedPluginManifest, PluginMcpServer} from '../plugins/types.js';

export interface ConfiguredMcpEndpoint {
  server: PluginMcpServer;
  source: 'config' | 'plugin';
  sourceLabel: string;
}

const toNamedServer = (
  name: string,
  server: ApeironCodeConfig['mcp']['servers'][string],
): PluginMcpServer => {
  if (server.type === 'http') {
    return {
      headers: server.headers,
      name,
      type: 'http',
      url: server.url,
    };
  }
  if (server.type === 'sse') {
    return {
      headers: server.headers,
      name,
      type: 'sse',
      url: server.url,
    };
  }

  return {
    args: server.args,
    command: server.command,
    env: server.env,
    name,
    type: 'stdio',
  };
};

export const listConfiguredMcpEndpoints = ({
  config,
  plugins,
}: {
  config: ApeironCodeConfig;
  plugins: LoadedPluginManifest[];
}): ConfiguredMcpEndpoint[] => {
  const endpoints = new Map<string, ConfiguredMcpEndpoint>();

  for (const endpoint of listPluginMcpEndpoints(plugins)) {
    endpoints.set(endpoint.server.name, {
      server: endpoint.server,
      source: 'plugin',
      sourceLabel: endpoint.pluginName,
    });
  }

  for (const [name, server] of Object.entries(config.mcp.servers)) {
    endpoints.set(name, {
      server: toNamedServer(name, server),
      source: 'config',
      sourceLabel: '.apeironcode-agent/config.json',
    });
  }

  return Array.from(endpoints.values()).sort((left, right) => left.server.name.localeCompare(right.server.name));
};

export const findConfiguredMcpEndpoint = ({
  config,
  plugins,
  serverName,
}: {
  config: ApeironCodeConfig;
  plugins: LoadedPluginManifest[];
  serverName: string;
}): ConfiguredMcpEndpoint | null => {
  return listConfiguredMcpEndpoints({config, plugins}).find((endpoint) => endpoint.server.name === serverName) ?? null;
};
