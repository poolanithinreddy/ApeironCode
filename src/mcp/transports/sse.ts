import type {JsonRpcNotification, JsonRpcRequest, JsonRpcResponse} from '../protocol.js';
import {McpProtocolError, isJsonRpcResponse} from '../protocol.js';
import {redactString} from '../redaction.js';
import type {McpTransport} from './types.js';

export interface SseTransportOptions {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  postUrl?: string;
  timeoutMs?: number;
  url: string;
}

interface PendingRequest {
  reject: (reason: unknown) => void;
  resolve: (value: JsonRpcResponse<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SseTransport implements McpTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly secrets: string[] = [];
  private connected = false;
  private notificationHandler: ((n: JsonRpcNotification) => void) | null = null;
  private pending = new Map<string | number, PendingRequest>();
  private streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private streamAbort: AbortController | null = null;

  constructor(private readonly options: SseTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    for (const value of Object.values(options.headers ?? {})) {
      this.secrets.push(value);
    }
  }

  async open(): Promise<void> {
    if (this.connected) {
      return;
    }
    const controller = new AbortController();
    this.streamAbort = controller;
    const response = await this.fetchImpl(this.options.url, {
      headers: {
        'accept': 'text/event-stream',
        ...(this.options.headers ?? {}),
      },
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new McpProtocolError(`SSE open failed: ${response.status} ${response.statusText}`, response.status);
    }
    this.streamReader = response.body.getReader();
    this.connected = true;
    void this.consumeStream();
  }

  private async consumeStream(): Promise<void> {
    if (!this.streamReader) {
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const {done, value} = await this.streamReader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, {stream: true});
        const events = buffer.split(/\r?\n\r?\n/u);
        buffer = events.pop() ?? '';
        for (const event of events) {
          this.handleSseEvent(event);
        }
      }
    } catch {
      // stream closed
    } finally {
      this.connected = false;
    }
  }

  private handleSseEvent(eventBlock: string): void {
    const dataLines = eventBlock.split(/\r?\n/u).filter((line) => line.startsWith('data:'));
    if (dataLines.length === 0) {
      return;
    }
    const payload = dataLines.map((line) => line.slice(5).trim()).join('\n');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (isJsonRpcResponse(parsed)) {
      const id = parsed.id;
      if (id === null) {
        return;
      }
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.resolve(parsed);
      }
      return;
    }
    if (parsed && typeof parsed === 'object' && 'method' in (parsed as Record<string, unknown>)) {
      this.notificationHandler?.(parsed as JsonRpcNotification);
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    this.streamAbort?.abort();
    this.streamAbort = null;
    if (this.streamReader) {
      try {
        await this.streamReader.cancel();
      } catch {
        // ignore
      }
      this.streamReader = null;
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new McpProtocolError('SSE transport closed.', -32000));
    }
    this.pending.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    this.notificationHandler = handler;
  }

  async request<T>(request: JsonRpcRequest, options?: {timeoutMs?: number}): Promise<JsonRpcResponse<T>> {
    if (!this.connected) {
      throw new McpProtocolError('SSE transport not opened.', -32000);
    }
    const timeoutMs = options?.timeoutMs ?? this.options.timeoutMs ?? 30_000;
    const postUrl = this.options.postUrl ?? this.options.url;
    const responsePromise = new Promise<JsonRpcResponse<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new McpProtocolError(`SSE MCP request timeout: ${request.method}`, -32002));
      }, timeoutMs);
      this.pending.set(request.id, {
        reject,
        resolve: resolve as PendingRequest['resolve'],
        timer,
      });
    });

    const postResponse = await this.fetchImpl(postUrl, {
      body: JSON.stringify(request),
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        ...(this.options.headers ?? {}),
      },
      method: 'POST',
    });
    if (!postResponse.ok) {
      const text = await safeText(postResponse);
      this.pending.delete(request.id);
      throw new McpProtocolError(
        `SSE post failed: ${postResponse.status} ${postResponse.statusText}${text ? ` — ${redactString(text, this.secrets).slice(0, 300)}` : ''}`,
        postResponse.status,
      );
    }
    return responsePromise;
  }
}

const safeText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};
