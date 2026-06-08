import {spawn, type ChildProcess} from 'node:child_process';
import type {JsonRpcNotification, JsonRpcRequest, JsonRpcResponse} from '../protocol.js';
import {McpProtocolError, isJsonRpcResponse} from '../protocol.js';
import type {McpTransport} from './types.js';

export interface StdioV2Options {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  spawnImpl?: typeof spawn;
  timeoutMs?: number;
}

interface Pending {
  reject: (reason: unknown) => void;
  resolve: (value: JsonRpcResponse<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class StdioV2Transport implements McpTransport {
  private buffer = '';
  private connected = false;
  private notificationHandler: ((n: JsonRpcNotification) => void) | null = null;
  private pending = new Map<string | number, Pending>();
  private process: ChildProcess | null = null;
  private readonly spawnImpl: typeof spawn;
  private stderrLines: string[] = [];

  constructor(private readonly options: StdioV2Options) {
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  async open(): Promise<void> {
    if (this.connected) {
      return;
    }
    this.process = this.spawnImpl(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd ?? process.cwd(),
      env: {...process.env, ...(this.options.env ?? {})},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
      throw new McpProtocolError('Failed to spawn MCP stdio process (missing stdio handles).', -32010);
    }
    this.process.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk.toString()));
    this.process.stderr.on('data', (chunk: Buffer) => this.captureStderr(chunk.toString()));
    this.process.on('exit', (code, signal) => {
      const message = `MCP stdio process exited (${code ?? 'null'}${signal ? `/${signal}` : ''}).`;
      this.connected = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new McpProtocolError(message, -32011));
      }
      this.pending.clear();
    });
    await new Promise<void>((resolve, reject) => {
      const onSpawn = (): void => {
        this.process?.off('error', onError);
        this.connected = true;
        resolve();
      };
      const onError = (err: Error): void => {
        this.process?.off('spawn', onSpawn);
        reject(new McpProtocolError(`MCP stdio spawn error: ${err.message}`, -32012));
      };
      this.process?.once('spawn', onSpawn);
      this.process?.once('error', onError);
    });
  }

  private captureStderr(chunk: string): void {
    for (const line of chunk.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      this.stderrLines.push(trimmed);
      if (this.stderrLines.length > 50) {
        this.stderrLines.shift();
      }
    }
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (isJsonRpcResponse(parsed)) {
        const id = parsed.id;
        if (id === null) {
          continue;
        }
        const pending = this.pending.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.resolve(parsed);
        }
        continue;
      }
      if (parsed && typeof parsed === 'object' && 'method' in (parsed as Record<string, unknown>)) {
        this.notificationHandler?.(parsed as JsonRpcNotification);
      }
    }
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.process) && !this.process?.killed;
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    this.notificationHandler = handler;
  }

  async request<T>(request: JsonRpcRequest, options?: {timeoutMs?: number}): Promise<JsonRpcResponse<T>> {
    if (!this.connected || !this.process?.stdin) {
      throw new McpProtocolError('Stdio MCP transport not connected.', -32013);
    }
    const timeoutMs = options?.timeoutMs ?? this.options.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new McpProtocolError(`Stdio MCP request timeout: ${request.method}`, -32014));
      }, timeoutMs);
      this.pending.set(request.id, {
        reject,
        resolve: resolve as Pending['resolve'],
        timer,
      });
      try {
        this.process!.stdin!.write(`${JSON.stringify(request)}\n`);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(new McpProtocolError(
          `Failed to write to stdio MCP transport: ${err instanceof Error ? err.message : String(err)}`,
          -32015,
        ));
      }
    });
  }

  async close(): Promise<void> {
    if (!this.process) {
      this.connected = false;
      return;
    }
    this.connected = false;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new McpProtocolError('Stdio MCP transport closed.', -32016));
    }
    this.pending.clear();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 3000);
      this.process!.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        this.process!.stdin?.end();
      } catch {
        // ignore
      }
    });
  }

  getStderrLines(limit = 20): string[] {
    return this.stderrLines.slice(-limit);
  }
}
