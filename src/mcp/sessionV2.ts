import {McpClientV2} from './clientV2.js';
import {summarizeMcpPermissions} from './permissions.js';
import {summarizeServerConfig, type McpServerConfig} from './serverConfig.js';
import {buildMcpToolDefinitions} from './toolRegistration.js';
import {buildTransport, type TransportFactoryOptions} from './transports/index.js';
import type {ToolDefinition} from '../tools/types.js';

export interface McpSessionOptions extends TransportFactoryOptions {
  config: McpServerConfig;
}

export interface McpSessionStatus {
  connected: boolean;
  enabled: boolean;
  id: string;
  toolCount: number;
  trustLevel: McpServerConfig['trustLevel'];
}

export class McpSessionV2 {
  readonly client: McpClientV2;
  private toolDefinitions: ToolDefinition[] = [];

  constructor(readonly config: McpServerConfig, options: TransportFactoryOptions = {}) {
    const transport = buildTransport(config, options);
    this.client = new McpClientV2({
      outputTokenLimit: config.outputTokenLimit,
      transport,
    });
  }

  async start(): Promise<ToolDefinition[]> {
    if (!this.config.enabled) {
      return [];
    }
    await this.client.open();
    await this.client.initialize();
    const tools = await this.client.listTools();
    this.toolDefinitions = buildMcpToolDefinitions({
      client: this.client,
      config: this.config,
      tools,
    });
    return this.toolDefinitions;
  }

  async stop(): Promise<void> {
    await this.client.shutdown();
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.toolDefinitions;
  }

  status(connected: boolean): McpSessionStatus {
    return {
      connected,
      enabled: this.config.enabled,
      id: this.config.id,
      toolCount: this.toolDefinitions.length,
      trustLevel: this.config.trustLevel,
    };
  }

  describePermissions(): string {
    return summarizeMcpPermissions(this.config);
  }

  describeConfig(): ReturnType<typeof summarizeServerConfig> {
    return summarizeServerConfig(this.config);
  }
}

export class McpSessionRegistry {
  private sessions = new Map<string, McpSessionV2>();

  add(session: McpSessionV2): void {
    this.sessions.set(session.config.id, session);
  }

  get(id: string): McpSessionV2 | undefined {
    return this.sessions.get(id);
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }

  list(): McpSessionV2[] {
    return Array.from(this.sessions.values());
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.list().map((session) => session.stop().catch(() => undefined)));
  }
}
