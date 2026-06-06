import type {ApeironCodeConfig} from '../config/config.js';
import {listConfiguredMcpEndpoints} from '../mcp/endpoints.js';
import {loadPluginCatalog} from '../plugins/loader.js';
import {loadAllPluginTools} from '../plugins/runtime.js';
import {getMcpToolsFromServer} from '../mcp/runtime.js';
import type {ToolDefinition} from './types.js';
import type {ToolRegistry} from './registry.js';

export const loadExternalTools = async (
  registry: ToolRegistry,
  config: ApeironCodeConfig,
  cwd: string,
): Promise<void> => {
  // Load plugin tools
  const plugins = await loadPluginCatalog({config, cwd});
  const pluginTools = await loadAllPluginTools(plugins);
  for (const tool of pluginTools) {
    tool.source = 'plugin';
    tool.enabled = true;
    registry.add(tool as ToolDefinition);
  }

  // Load MCP tools
  const mcpEndpoints = listConfiguredMcpEndpoints({config, plugins});
  for (const endpoint of mcpEndpoints) {
    const mcpTools = await getMcpToolsFromServer(
      endpoint.server.name,
      endpoint.server,
      cwd,
    );
    for (const tool of mcpTools) {
      tool.source = 'mcp';
      tool.enabled = true;
      registry.add(tool as ToolDefinition);
    }
  }
};

export const formatToolList = (tools: ToolDefinition[]): string => {
  const bySource = new Map<string, ToolDefinition[]>();

  for (const tool of tools) {
    const source = tool.source || 'builtin';
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(tool);
  }

  const lines: string[] = [];

  // Built-in tools first
  if (bySource.has('builtin')) {
    lines.push('Built-in Tools:');
    for (const tool of bySource.get('builtin')!) {
      const riskLevel = tool.riskLevel ? ` [${tool.riskLevel}]` : '';
      lines.push(`  ${tool.name}${riskLevel} — ${tool.description}`);
    }
    lines.push('');
  }

  // Plugin tools
  if (bySource.has('plugin')) {
    lines.push('Plugin Tools:');
    for (const tool of bySource.get('plugin')!) {
      const riskLevel = tool.riskLevel ? ` [${tool.riskLevel}]` : '';
      lines.push(`  ${tool.name}${riskLevel} — ${tool.description}`);
    }
    lines.push('');
  }

  // MCP tools
  if (bySource.has('mcp')) {
    lines.push('MCP Tools:');
    for (const tool of bySource.get('mcp')!) {
      const riskLevel = tool.riskLevel ? ` [${tool.riskLevel}]` : '';
      lines.push(`  ${tool.name}${riskLevel} — ${tool.description}`);
    }
  }

  return lines.join('\n');
};
