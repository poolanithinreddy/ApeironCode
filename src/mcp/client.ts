import type {PluginMcpServer} from '../plugins/types.js';
import {AppError} from '../utils/errors.js';
import {StdioTransport} from './transport.js';
import type {
  McpInitializeResponse,
  McpPrompt,
  McpResource,
  McpResourceContents,
  McpTool,
  McpToolCallResponse,
  McpToolsListResponse,
} from './types.js';

export class McpClient {
  private transport: StdioTransport | null = null;
  private initialized = false;
  private initializeResponse: McpInitializeResponse | null = null;

  async connect(server: PluginMcpServer, cwd: string): Promise<void> {
    if (server.type !== 'stdio') {
      const serverWithType = server as {type: string};
      throw new AppError(
        `Unsupported MCP server type: ${serverWithType.type}`,
        'MCP_UNSUPPORTED_TYPE',
      );
    }

    this.transport = new StdioTransport();

    await this.transport.connect({
      command: server.command,
      args: server.args,
      cwd,
      env: server.env,
    });

    this.initializeResponse = await this.initialize();
  }

  private async initialize(): Promise<McpInitializeResponse> {
    if (!this.transport) {
      throw new AppError('Transport not initialized', 'MCP_NOT_CONNECTED');
    }

    const response = (await this.transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'apeironcode-agent',
        version: '0.1.0',
      },
    })) as McpInitializeResponse;

    this.initialized = true;
    return response;
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }

    const response = (await this.transport.request('tools/list')) as McpToolsListResponse;
    return response.tools || [];
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<McpToolCallResponse> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }

    const response = (await this.transport.request('tools/call', {
      name,
      arguments: input,
    })) as McpToolCallResponse;

    return response;
  }

  async listResources(): Promise<McpResource[]> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }
    const response = (await this.transport.request('resources/list')) as {resources?: McpResource[]};
    return response.resources ?? [];
  }

  async readResource(uri: string): Promise<McpResourceContents> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }
    return (await this.transport.request('resources/read', {uri})) as McpResourceContents;
  }

  async listPrompts(): Promise<McpPrompt[]> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }
    const response = (await this.transport.request('prompts/list')) as {prompts?: McpPrompt[]};
    return response.prompts ?? [];
  }

  async getPrompt(name: string, args?: Record<string, unknown>): Promise<{messages: Array<{content: {text?: string; type: string}; role: string}>}> {
    if (!this.transport || !this.initialized) {
      throw new AppError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
    }
    return (await this.transport.request('prompts/get', {arguments: args, name})) as {messages: Array<{content: {text?: string; type: string}; role: string}>};
  }

  async ping(): Promise<boolean> {
    if (!this.transport || !this.initialized) {
      return false;
    }
    try {
      await this.transport.request('ping');
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
      this.transport = null;
      this.initialized = false;
      this.initializeResponse = null;
    }
  }

  isConnected(): boolean {
    return Boolean(this.transport?.isConnected()) && this.initialized;
  }

  getServerInfo(): McpInitializeResponse['serverInfo'] | null {
    return this.initializeResponse?.serverInfo ?? null;
  }

  getCapabilities(): McpInitializeResponse['capabilities'] | null {
    return this.initializeResponse?.capabilities ?? null;
  }

  getStderrOutput(limit = 20): string[] {
    return this.transport?.getStderrOutput(limit) ?? [];
  }

  getConnectionDetails(): ReturnType<StdioTransport['getConnectionDetails']> {
    return this.transport?.getConnectionDetails() ?? null;
  }
}
