import {
  McpProtocolError,
  buildRequest,
  type InitializeResult,
  type McpPrompt,
  type McpPromptResult,
  type McpResource,
  type McpResourceContents,
  type McpToolCallResult,
  type McpToolDefinition,
} from './protocol.js';
import type {McpTransport} from './transports/types.js';

const PROTOCOL_VERSION = '2024-11-05';

export interface McpClientV2Options {
  clientName?: string;
  clientVersion?: string;
  outputTokenLimit?: number;
  transport: McpTransport;
}

export class McpClientV2 {
  private readonly clientName: string;
  private readonly clientVersion: string;
  private idCounter = 0;
  private initialized = false;
  private initializeResult: InitializeResult | null = null;
  private readonly outputTokenLimit?: number;
  private readonly transport: McpTransport;

  constructor(options: McpClientV2Options) {
    this.clientName = options.clientName ?? 'apeironcode-agent';
    this.clientVersion = options.clientVersion ?? '0.1.0';
    this.outputTokenLimit = options.outputTokenLimit;
    this.transport = options.transport;
  }

  private nextId(): number {
    return ++this.idCounter;
  }

  async open(): Promise<void> {
    await this.transport.open();
  }

  async initialize(): Promise<InitializeResult> {
    if (this.initialized && this.initializeResult) {
      return this.initializeResult;
    }
    const response = await this.transport.request<InitializeResult>(
      buildRequest(this.nextId(), 'initialize', {
        capabilities: {prompts: {}, resources: {}, tools: {}},
        clientInfo: {name: this.clientName, version: this.clientVersion},
        protocolVersion: PROTOCOL_VERSION,
      }),
    );
    if (response.error) {
      throw new McpProtocolError(`MCP initialize failed: ${response.error.message}`, response.error.code);
    }
    if (!response.result) {
      throw new McpProtocolError('MCP initialize returned no result.');
    }
    this.initializeResult = response.result;
    this.initialized = true;
    return response.result;
  }

  getServerInfo(): InitializeResult | null {
    return this.initializeResult;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.transport.request(buildRequest(this.nextId(), 'ping'));
      return !response.error;
    } catch {
      return false;
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const response = await this.transport.request<{tools?: McpToolDefinition[]}>(
      buildRequest(this.nextId(), 'tools/list'),
    );
    if (response.error) {
      throw new McpProtocolError(`tools/list failed: ${response.error.message}`, response.error.code);
    }
    return response.result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const response = await this.transport.request<McpToolCallResult>(
      buildRequest(this.nextId(), 'tools/call', {arguments: args, name}),
    );
    if (response.error) {
      throw new McpProtocolError(`tools/call failed: ${response.error.message}`, response.error.code);
    }
    if (!response.result) {
      return {content: [], isError: true};
    }
    return this.applyOutputLimit(response.result);
  }

  async listResources(): Promise<McpResource[]> {
    const response = await this.transport.request<{resources?: McpResource[]}>(
      buildRequest(this.nextId(), 'resources/list'),
    );
    if (response.error) {
      throw new McpProtocolError(`resources/list failed: ${response.error.message}`, response.error.code);
    }
    return response.result?.resources ?? [];
  }

  async readResource(uri: string): Promise<McpResourceContents> {
    const response = await this.transport.request<McpResourceContents>(
      buildRequest(this.nextId(), 'resources/read', {uri}),
    );
    if (response.error) {
      throw new McpProtocolError(`resources/read failed: ${response.error.message}`, response.error.code);
    }
    return response.result ?? {contents: []};
  }

  async listPrompts(): Promise<McpPrompt[]> {
    const response = await this.transport.request<{prompts?: McpPrompt[]}>(
      buildRequest(this.nextId(), 'prompts/list'),
    );
    if (response.error) {
      throw new McpProtocolError(`prompts/list failed: ${response.error.message}`, response.error.code);
    }
    return response.result?.prompts ?? [];
  }

  async getPrompt(name: string, args?: Record<string, unknown>): Promise<McpPromptResult> {
    const response = await this.transport.request<McpPromptResult>(
      buildRequest(this.nextId(), 'prompts/get', {arguments: args, name}),
    );
    if (response.error) {
      throw new McpProtocolError(`prompts/get failed: ${response.error.message}`, response.error.code);
    }
    return response.result ?? {messages: []};
  }

  async shutdown(): Promise<void> {
    try {
      await this.transport.close();
    } finally {
      this.initialized = false;
      this.initializeResult = null;
    }
  }

  private applyOutputLimit(result: McpToolCallResult): McpToolCallResult {
    if (!this.outputTokenLimit) {
      return result;
    }
    const limit = this.outputTokenLimit * 4; // ~4 chars per token
    let total = 0;
    let truncated = false;
    const trimmed = result.content.map((item) => {
      if (item.type !== 'text' || !item.text) {
        return item;
      }
      const remaining = Math.max(0, limit - total);
      if (item.text.length <= remaining) {
        total += item.text.length;
        return item;
      }
      truncated = true;
      const text = item.text.slice(0, remaining);
      total = limit;
      return {...item, text};
    });
    if (truncated) {
      trimmed.push({text: `\n\n[output truncated at ${this.outputTokenLimit} tokens]`, type: 'text'});
    }
    return {content: trimmed, isError: result.isError};
  }
}
