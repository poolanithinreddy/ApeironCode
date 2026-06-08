/**
 * ApeironCode Bridge — local WebSocket transport.
 * Binds only to 127.0.0.1. Requires auth token. No public exposure.
 */

import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import type {IncomingMessage, Server} from 'node:http';
import type {BridgeMessage} from '../types.js';
import {isBridgeMessage, createBridgeErrorMessage} from '../types.js';
import {validateBridgeToken} from '../auth.js';
import type {BridgeSecretInfo} from '../auth.js';
import {sanitizeBridgeMessage} from '../redaction.js';
import type {
  BridgeTransport,
  BridgeConnection,
  BridgeServerOptions,
  MessageHandler,
  ConnectionHandler,
  CloseHandler,
} from './types.js';

const PING_INTERVAL_MS = 30_000;
const MAX_MESSAGE_BYTES = 512_000; // 512 KB

// ─── Connection ─────────────────────────────────────────────────────────────

class WebSocketConnection implements BridgeConnection {
  public authenticated = false;
  public readonly connectedAt: string;

  constructor(
    public readonly id: string,
    private readonly ws: WebSocket,
  ) {
    this.connectedAt = new Date().toISOString();
  }

  async send(message: BridgeMessage): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const safe = sanitizeBridgeMessage(message);
    return new Promise<void>((resolve) => {
      this.ws.send(JSON.stringify(safe), (err) => {
        if (err) {
          // Log only non-secret error type; do not include raw error message
          process.stderr.write(`[bridge-ws] send error on connection ${this.id.slice(0, 8)}\n`);
        }
        resolve();
      });
    });
  }

  close(): void {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close(1000, 'closed by server');
    }
  }

  ping(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
  }
}

// ─── Transport ──────────────────────────────────────────────────────────────

export interface WebSocketTransportOptions {
  /** Secret info for token validation. Required if auth is enforced. */
  secretInfo?: BridgeSecretInfo;
}

export class WebSocketTransport implements BridgeTransport {
  private readonly secretInfo: BridgeSecretInfo | undefined;
  private connections = new Map<string, WebSocketConnection>();
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private port = 0;

  constructor(options: WebSocketTransportOptions = {}) {
    this.secretInfo = options.secretInfo;
  }

  /** Returns the bound port (0 until started). */
  getPort(): number { return this.port; }

  async start(options: BridgeServerOptions = {}): Promise<void> {
    const host = '127.0.0.1'; // always local-only
    const requestedPort = options.port ?? 0;

    this.httpServer = createServer();
    this.wss = new WebSocketServer({server: this.httpServer});

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(requestedPort, host, () => {
        const addr = this.httpServer!.address();
        this.port = typeof addr === 'object' && addr !== null ? addr.port : 0;
        resolve();
      });
      this.httpServer!.once('error', reject);
    });

    this.pingTimer = setInterval(() => this.doPing(), PING_INTERVAL_MS);
    if (typeof this.pingTimer === 'object' && this.pingTimer !== null && 'unref' in this.pingTimer) {
      (this.pingTimer as {unref: () => void}).unref();
    }
  }

  async stop(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();

    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
    await new Promise<void>((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
    this.wss = null;
    this.httpServer = null;
    this.port = 0;
  }

  async send(connectionId: string, message: BridgeMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (conn) await conn.send(message);
  }

  async broadcast(message: BridgeMessage): Promise<void> {
    for (const conn of this.connections.values()) {
      if (conn.authenticated) await conn.send(message);
    }
  }

  onMessage(handler: MessageHandler): void { this.messageHandlers.push(handler); }
  onConnection(handler: ConnectionHandler): void { this.connectionHandlers.push(handler); }
  onClose(handler: CloseHandler): void { this.closeHandlers.push(handler); }

  connectionCount(): number { return this.connections.size; }
  connectionIds(): string[] { return [...this.connections.keys()]; }

  // ─── Internal ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const id = randomUUID();
    const conn = new WebSocketConnection(id, ws);
    this.connections.set(id, conn);

    for (const h of this.connectionHandlers) h(conn);

    ws.on('message', (data) => {
      void this.handleRawMessage(conn, data);
    });

    ws.on('pong', () => {
      // pong received — connection alive
    });

    ws.on('close', () => {
      this.connections.delete(id);
      for (const h of this.closeHandlers) h(id);
    });

    ws.on('error', () => {
      // Error logged at connection level only; no token in message
      this.connections.delete(id);
      for (const h of this.closeHandlers) h(id, 'error');
    });
  }

  private async handleRawMessage(conn: WebSocketConnection, data: unknown): Promise<void> {
    let raw: string;
    try {
      if (Buffer.isBuffer(data)) {
        if (data.length > MAX_MESSAGE_BYTES) {
          await conn.send(createBridgeErrorMessage('MESSAGE_TOO_LARGE', 'Message exceeds size limit'));
          return;
        }
        raw = data.toString('utf8');
      } else if (typeof data === 'string') {
        if (data.length > MAX_MESSAGE_BYTES) {
          await conn.send(createBridgeErrorMessage('MESSAGE_TOO_LARGE', 'Message exceeds size limit'));
          return;
        }
        raw = data;
      } else {
        await conn.send(createBridgeErrorMessage('INVALID_FORMAT', 'Expected UTF-8 text or binary'));
        return;
      }
    } catch {
      await conn.send(createBridgeErrorMessage('PARSE_ERROR', 'Could not read message data'));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await conn.send(createBridgeErrorMessage('PARSE_ERROR', 'Invalid JSON'));
      return;
    }

    if (!isBridgeMessage(parsed)) {
      await conn.send(createBridgeErrorMessage('INVALID_MESSAGE', 'Malformed bridge message envelope'));
      return;
    }

    // Auth gate: allow hello without auth; all others require authenticated connection
    if (!conn.authenticated && parsed.type !== 'bridge.hello') {
      if (this.secretInfo) {
        await conn.send(createBridgeErrorMessage('UNAUTHENTICATED', 'Authentication required', parsed.id));
        return;
      }
      // No secret configured → allow (tests/dev mode)
      conn.authenticated = true;
    }

    // On bridge.hello, validate token if secret is configured
    if (parsed.type === 'bridge.hello' && this.secretInfo) {
      const token = parsed.payload['token'];
      if (typeof token !== 'string' || !validateBridgeToken(token, this.secretInfo)) {
        await conn.send(createBridgeErrorMessage('AUTH_FAILED', 'Invalid bridge token', parsed.id));
        return;
      }
      conn.authenticated = true;
    }

    for (const h of this.messageHandlers) await h(conn, parsed);
  }

  private doPing(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.ping();
      } catch {
        // Ignore ping errors
      }
    }
  }
}

/** Creates a WebSocket transport with optional auth. */
export const createWebSocketTransport = (
  options: WebSocketTransportOptions = {},
): WebSocketTransport => new WebSocketTransport(options);

/** Returns a ws:// endpoint string for the given port. */
export const buildWsEndpoint = (port: number): string =>
  `ws://127.0.0.1:${port}`;
