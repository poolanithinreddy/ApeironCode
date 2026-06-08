/**
 * ApeironCode Bridge Transport interface.
 * Provides the abstraction layer between the bridge server and its network/IPC mechanism.
 */

import type {BridgeMessage} from '../types.js';

export interface BridgeConnection {
  id: string;
  /** Whether the connection has been authenticated. */
  authenticated: boolean;
  /** ISO timestamp when connection was established. */
  connectedAt: string;
  /** Send a message to this specific connection. */
  send: (message: BridgeMessage) => Promise<void>;
  /** Close this connection. */
  close: () => void;
}

export type MessageHandler = (connection: BridgeConnection, message: BridgeMessage) => Promise<void>;
export type ConnectionHandler = (connection: BridgeConnection) => void;
export type CloseHandler = (connectionId: string, reason?: string) => void;

export interface BridgeServerOptions {
  /** Only bind to 127.0.0.1 (local-only). Default: true. */
  localOnly?: boolean;
  /** Auth token required for connections. */
  authToken?: string;
  /** Optional port (for socket transports). */
  port?: number;
}

export interface BridgeClientOptions {
  authToken: string;
  /** Server endpoint (e.g. 'ws://127.0.0.1:PORT'). Optional for in-memory. */
  endpoint?: string;
}

export interface BridgeTransport {
  /** Starts the transport (binds ports, etc.). */
  start(options?: BridgeServerOptions): Promise<void>;
  /** Stops the transport and closes all connections. */
  stop(): Promise<void>;
  /** Sends a message to a specific connection. */
  send(connectionId: string, message: BridgeMessage): Promise<void>;
  /** Broadcasts a message to all authenticated connections. */
  broadcast(message: BridgeMessage): Promise<void>;
  /** Registers a handler for incoming messages. */
  onMessage(handler: MessageHandler): void;
  /** Registers a handler for new connections. */
  onConnection(handler: ConnectionHandler): void;
  /** Registers a handler for connection closes. */
  onClose(handler: CloseHandler): void;
  /** Returns the number of active connections. */
  connectionCount(): number;
  /** Returns all active connection ids. */
  connectionIds(): string[];
}
