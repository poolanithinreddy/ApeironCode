import type {PluginMcpServer} from '../plugins/types.js';
import {toError} from '../utils/errors.js';
import {McpClient} from './client.js';
import type {McpTool, McpToolCallResponse} from './types.js';

interface ManagedMcpServer {
  client: McpClient;
  connectedAt: string;
  cwd: string;
  lastUsedAt: string;
  server: PluginMcpServer;
  serverSignature: string;
  tools: McpTool[];
}

interface FailedMcpServer {
  cwd: string;
  lastError: string;
  server: PluginMcpServer;
  stderr: string[];
  updatedAt: string;
}

export interface McpServerDiagnostics {
  capabilities?: Record<string, unknown>;
  connected: boolean;
  connectedAt?: string;
  endpointType: PluginMcpServer['type'];
  lastError?: string;
  lastUsedAt?: string;
  serverInfo?: {name: string; version: string};
  serverName: string;
  stderr: string[];
  toolCount: number;
}

export interface McpServerTestResult {
  diagnostics: McpServerDiagnostics;
  ok: boolean;
  tools: McpTool[];
}

const now = (): string => new Date().toISOString();

const buildServerKey = (serverName: string, cwd: string): string => `${cwd}::${serverName}`;

const buildServerSignature = (server: PluginMcpServer): string => JSON.stringify(server);

export class McpServerManager {
  private readonly failedServers = new Map<string, FailedMcpServer>();
  private readonly servers = new Map<string, ManagedMcpServer>();

  private buildDiagnostics(
    serverName: string,
    server: PluginMcpServer,
    entry?: ManagedMcpServer,
    failure?: FailedMcpServer,
  ): McpServerDiagnostics {
    return {
      capabilities: entry?.client.getCapabilities() as Record<string, unknown> | null ?? undefined,
      connected: entry?.client.isConnected() ?? false,
      connectedAt: entry?.connectedAt,
      endpointType: server.type,
      lastError: failure?.lastError,
      lastUsedAt: entry?.lastUsedAt,
      serverInfo: entry?.client.getServerInfo() ?? undefined,
      serverName,
      stderr: entry?.client.getStderrOutput() ?? failure?.stderr ?? [],
      toolCount: entry?.tools.length ?? 0,
    };
  }

  private async ensureServer(
    serverName: string,
    server: PluginMcpServer,
    cwd: string,
  ): Promise<ManagedMcpServer> {
    const key = buildServerKey(serverName, cwd);
    const signature = buildServerSignature(server);
    const existing = this.servers.get(key);

    if (existing && existing.serverSignature === signature && existing.client.isConnected()) {
      existing.lastUsedAt = now();
      return existing;
    }

    if (existing) {
      await this.disconnectServer(serverName, cwd);
    }

    const client = new McpClient();
    try {
      await client.connect(server, cwd);
      const entry: ManagedMcpServer = {
        client,
        connectedAt: now(),
        cwd,
        lastUsedAt: now(),
        server,
        serverSignature: signature,
        tools: [],
      };
      this.failedServers.delete(key);
      this.servers.set(key, entry);
      return entry;
    } catch (error) {
      const runtimeError = toError(error);
      this.failedServers.set(key, {
        cwd,
        lastError: runtimeError.message,
        server,
        stderr: client.getStderrOutput(),
        updatedAt: now(),
      });
      await client.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async listTools(
    serverName: string,
    server: PluginMcpServer,
    cwd: string,
  ): Promise<{diagnostics: McpServerDiagnostics; tools: McpTool[]}> {
    try {
      const entry = await this.ensureServer(serverName, server, cwd);
      entry.tools = await entry.client.listTools();
      entry.lastUsedAt = now();
      return {
        diagnostics: this.buildDiagnostics(serverName, server, entry),
        tools: entry.tools,
      };
    } catch (error) {
      const key = buildServerKey(serverName, cwd);
      const failure = this.failedServers.get(key);
      throw Object.assign(toError(error), {
        diagnostics: this.buildDiagnostics(serverName, server, undefined, failure),
      });
    }
  }

  async callTool(
    serverName: string,
    server: PluginMcpServer,
    cwd: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<{diagnostics: McpServerDiagnostics; response: McpToolCallResponse}> {
    try {
      const entry = await this.ensureServer(serverName, server, cwd);
      const response = await entry.client.callTool(toolName, input);
      entry.lastUsedAt = now();
      return {
        diagnostics: this.buildDiagnostics(serverName, server, entry),
        response,
      };
    } catch (error) {
      const key = buildServerKey(serverName, cwd);
      const failure = this.failedServers.get(key);
      throw Object.assign(toError(error), {
        diagnostics: this.buildDiagnostics(serverName, server, undefined, failure),
      });
    }
  }

  async testServer(
    serverName: string,
    server: PluginMcpServer,
    cwd: string,
  ): Promise<McpServerTestResult> {
    try {
      const {diagnostics, tools} = await this.listTools(serverName, server, cwd);
      return {
        diagnostics,
        ok: true,
        tools,
      };
    } catch (error) {
      const diagnostics = (error as {diagnostics?: McpServerDiagnostics}).diagnostics
        ?? this.buildDiagnostics(serverName, server, undefined, this.failedServers.get(buildServerKey(serverName, cwd)));
      return {
        diagnostics: {
          ...diagnostics,
          lastError: toError(error).message,
        },
        ok: false,
        tools: [],
      };
    }
  }

  async disconnectServer(serverName: string, cwd: string): Promise<void> {
    const key = buildServerKey(serverName, cwd);
    const entry = this.servers.get(key);
    if (!entry) {
      return;
    }

    this.servers.delete(key);
    await entry.client.disconnect().catch(() => undefined);
  }

  async disconnectWorkspace(cwd: string): Promise<void> {
    const disconnects = Array.from(this.servers.entries())
      .filter(([, entry]) => entry.cwd === cwd)
      .map(([key, entry]) => {
        this.servers.delete(key);
        return entry.client.disconnect().catch(() => undefined);
      });

    await Promise.all(disconnects);
  }
}

export const sharedMcpServerManager = new McpServerManager();