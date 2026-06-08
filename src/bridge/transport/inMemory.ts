/**
 * In-memory bridge transport for tests and local development.
 * No real network connections — deterministic, synchronous-style message delivery.
 */

import {randomUUID} from 'node:crypto';
import type {
  BridgeTransport,
  BridgeConnection,
  BridgeServerOptions,
  MessageHandler,
  ConnectionHandler,
  CloseHandler,
} from './types.js';
import type {BridgeMessage} from '../types.js';

class InMemoryConnection implements BridgeConnection {
  public authenticated = false;
  public readonly connectedAt: string;
  private readonly transport: InMemoryTransport;
  private closed = false;
  /** Messages received by this connection (server → client). */
  public readonly received: BridgeMessage[] = [];

  constructor(
    public readonly id: string,
    transport: InMemoryTransport,
  ) {
    this.connectedAt = new Date().toISOString();
    this.transport = transport;
  }

  async send(message: BridgeMessage): Promise<void> {
    this.received.push(message);
    await this.transport.deliverToClient(this.id, message);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.removeConnection(this.id);
  }

  isClosed(): boolean { return this.closed; }
}

export class InMemoryTransport implements BridgeTransport {
  private connections = new Map<string, InMemoryConnection>();
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  /** Messages delivered to clients (for test assertions). */
  public readonly clientMessages: Map<string, BridgeMessage[]> = new Map();
  private running = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  start(_options?: BridgeServerOptions): Promise<void> {
    this.running = true;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    this.running = false;
    return Promise.resolve();
  }

  isRunning(): boolean { return this.running; }

  /** Creates a new simulated client connection. Returns the connection id. */
  connect(options: {authToken?: string; authenticated?: boolean} = {}): string {
    const id = randomUUID();
    const conn = new InMemoryConnection(id, this);
    conn.authenticated = options.authenticated ?? false;
    this.connections.set(id, conn);
    this.clientMessages.set(id, []);
    for (const handler of this.connectionHandlers) handler(conn);
    return id;
  }

  /** Simulates a client sending a message to the server. */
  async sendFromClient(connectionId: string, message: BridgeMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) throw new Error(`Unknown connection: ${connectionId}`);
    for (const handler of this.messageHandlers) await handler(conn, message);
  }

  /** Internal: delivers a message to the client-side received list. */
  deliverToClient(connectionId: string, message: BridgeMessage): Promise<void> {
    const list = this.clientMessages.get(connectionId);
    if (list) list.push(message);
    return Promise.resolve();
  }

  /** Returns messages delivered to a specific client. */
  getClientMessages(connectionId: string): BridgeMessage[] {
    return this.clientMessages.get(connectionId) ?? [];
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
    for (const handler of this.closeHandlers) handler(id);
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

  getConnection(id: string): InMemoryConnection | undefined {
    return this.connections.get(id);
  }
}
