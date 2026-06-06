import type {ToolDefinition, ToolExecutionContext, ToolResult} from '../tools/types.js';
import type {PluginMcpServer} from '../plugins/types.js';
import {McpSessionV2} from './sessionV2.js';
import type {McpServerConfig} from './serverConfig.js';

export interface McpToolDefinition extends Omit<ToolDefinition, 'run'> {
  inputSchemaDefinition?: Record<string, unknown>;
  serverName: string;
  mcpServer: PluginMcpServer;
  toolName: string;
  run: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult>;
}

const toServerConfig = (
  serverName: string,
  mcpServer: PluginMcpServer,
): McpServerConfig => {
  const base = {
    enabled: true,
    id: serverName,
    name: serverName,
    timeoutMs: 30_000,
    trustLevel: 'low' as const,
  };
  if (mcpServer.type === 'stdio') {
    return {...base, args: mcpServer.args, command: mcpServer.command, env: mcpServer.env, transport: 'stdio'};
  }
  if (mcpServer.type === 'http') {
    return {...base, headers: mcpServer.headers, transport: 'http', url: mcpServer.url};
  }
  return {...base, headers: mcpServer.headers, transport: 'sse', url: mcpServer.url};
};

export const getMcpToolsFromServer = async (
  serverName: string,
  mcpServer: PluginMcpServer,
  cwd: string,
): Promise<McpToolDefinition[]> => {
  const session = new McpSessionV2(toServerConfig(serverName, mcpServer), {cwd});
  try {
    const tools = await session.start();
    return tools.map((tool) => ({
      ...tool,
      inputSchemaDefinition: {},
      mcpServer,
      serverName,
      toolName: tool.name.startsWith(`mcp:${serverName}.`)
        ? tool.name.slice(`mcp:${serverName}.`.length)
        : tool.name,
    }));
  } catch {
    // Failed to connect or list tools, return empty array
    return [];
  }
};
