import type {JsonRpcNotification, JsonRpcRequest, JsonRpcResponse} from '../protocol.js';
import type {spawn} from 'node:child_process';

export interface McpTransport {
  close(): Promise<void>;
  isConnected(): boolean;
  onNotification(handler: (notification: JsonRpcNotification) => void): void;
  open(): Promise<void>;
  request<T>(request: JsonRpcRequest, options?: {timeoutMs?: number}): Promise<JsonRpcResponse<T>>;
}

export interface TransportFactoryOptions {
  cwd?: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
}
