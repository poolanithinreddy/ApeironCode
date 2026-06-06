import type {JsonRpcNotification, JsonRpcRequest, JsonRpcResponse} from '../protocol.js';
import {McpProtocolError} from '../protocol.js';
import {redactString} from '../redaction.js';
import type {McpTransport} from './types.js';

export interface HttpTransportOptions {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
  url: string;
}

export class HttpTransport implements McpTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly secrets: string[] = [];
  private connected = false;

  constructor(private readonly options: HttpTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    for (const value of Object.values(options.headers ?? {})) {
      this.secrets.push(value);
    }
  }

  open(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    void handler;
    // HTTP transport does not deliver server-initiated notifications.
  }

  async request<T>(request: JsonRpcRequest, options?: {timeoutMs?: number}): Promise<JsonRpcResponse<T>> {
    if (!this.connected) {
      throw new McpProtocolError('HTTP transport not opened.', -32000);
    }
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? this.options.timeoutMs ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(this.options.url, {
        body: JSON.stringify(request),
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          ...(this.options.headers ?? {}),
        },
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await safeText(response);
        throw new McpProtocolError(
          `HTTP MCP request failed: ${response.status} ${response.statusText}${body ? ` — ${redactString(body, this.secrets).slice(0, 300)}` : ''}`,
          response.status,
        );
      }
      return await response.json() as JsonRpcResponse<T>;
    } catch (error) {
      if (error instanceof McpProtocolError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new McpProtocolError(`HTTP MCP transport error: ${redactString(message, this.secrets)}`, -32001);
    } finally {
      clearTimeout(timer);
    }
  }
}

const safeText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};
