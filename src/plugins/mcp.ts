import type {LoadedPluginManifest, PluginMcpServer} from './types.js';

export interface PluginMcpEndpoint {
  pluginName: string;
  server: PluginMcpServer;
}

export const listPluginMcpEndpoints = (
  plugins: LoadedPluginManifest[],
): PluginMcpEndpoint[] => {
  return plugins.flatMap((plugin) =>
    plugin.manifest.mcpServers.map((server) => ({
      pluginName: plugin.manifest.name,
      server,
    })),
  );
};

export const formatPluginCatalog = (plugins: LoadedPluginManifest[]): string => {
  if (plugins.length === 0) {
    return 'No plugin manifests found.';
  }

  return plugins
    .map((plugin) => {
      const mcpCount = plugin.manifest.mcpServers.length;
      const toolCount = plugin.manifest.tools.length;
      const promptCount = plugin.manifest.prompts.length;
      const status = plugin.enabled ? 'enabled' : 'disabled';
      const errors = plugin.errors.length > 0 ? ` errors=${plugin.errors.join('; ')}` : '';
      return `${plugin.manifest.name}@${plugin.manifest.version} [${status}] tools=${toolCount} prompts=${promptCount} mcp=${mcpCount}${errors}`;
    })
    .join('\n');
};