import {spawn, type ChildProcess} from 'node:child_process';
import {AppError} from '../utils/errors.js';
import type {JsonRpcRequest, JsonRpcResponse} from './types.js';

export interface TransportOptions {
  command: string;
  args: string[];
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export class StdioTransport {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private outputBuffer = '';
  private stderrLines: string[] = [];
  private connected = false;
  private exitCode: number | null = null;
  private exitSignal: string | null = null;
  private connectionInfo: {args: string[]; command: string; cwd: string} | null = null;

  async connect(options: TransportOptions): Promise<void> {
    const {command, args, cwd = process.cwd(), timeout = 30_000, env} = options;
    this.connectionInfo = {args, command, cwd};

    try {
      this.process = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
        },
      });

      await this.setupHandlers(timeout);
    } catch (err) {
      throw new AppError(
        `Failed to spawn MCP server: ${err instanceof Error ? err.message : String(err)}`,
        'MCP_SPAWN_ERROR',
      );
    }
  }

  private async setupHandlers(timeout: number): Promise<void> {
    if (!this.process || !this.process.stdout || !this.process.stderr) {
      throw new AppError('Process not properly initialized', 'MCP_SETUP_ERROR');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        settled = true;
        reject(this.withStderr(new AppError('MCP server initialization timeout', 'MCP_TIMEOUT')));
      }, timeout);

      const cleanup = (): void => {
        this.process?.off('spawn', onSpawn);
        this.process?.off('error', onError);
        this.process?.off('close', onClose);
        clearTimeout(timeoutHandle);
      };

      const onSpawn = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.connected = true;
        cleanup();
        resolve();
      };

      const onError = (err: Error): void => {
        const wrapped = this.withStderr(new AppError(
          `MCP process error: ${err instanceof Error ? err.message : String(err)}`,
          'MCP_PROCESS_ERROR',
        ));
        this.connected = false;
        this.rejectPendingRequests(wrapped);
        if (!settled) {
          settled = true;
          cleanup();
          reject(wrapped);
        }
      };

      const onClose = (code: number | null, signal: string | null): void => {
        this.connected = false;
        this.exitCode = code;
        this.exitSignal = signal;
        const wrapped = this.withStderr(new AppError(
          `MCP process exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
          'MCP_PROCESS_EXIT',
        ));
        this.rejectPendingRequests(wrapped);
        if (!settled && code !== 0) {
          settled = true;
          cleanup();
          reject(wrapped);
        }
      };

      this.process!.stdout!.on('data', (data: Buffer) => {
        this.outputBuffer += data.toString();
        this.processMessages();
      });

      this.process!.stderr!.on('data', (data: Buffer) => {
        this.captureStderr(data.toString());
      });

      this.process!.once('spawn', onSpawn);
      this.process!.once('error', onError);
      this.process!.once('close', onClose);
    });
  }

  private captureStderr(chunk: string): void {
    for (const line of chunk.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      this.stderrLines.push(trimmed);
      if (this.stderrLines.length > 20) {
        this.stderrLines.shift();
      }
    }
  }

  private withStderr(error: AppError): AppError {
    if (this.stderrLines.length === 0) {
      return error;
    }

    return new AppError(
      `${error.message}\nMCP stderr:\n${this.stderrLines.slice(-5).join('\n')}`,
      error.code,
    );
  }

  private rejectPendingRequests(error: AppError): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private processMessages(): void {
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        this.handleResponse(response);
      } catch {
        // Invalid JSON line, skip
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(this.withStderr(new AppError(
        `MCP error: ${response.error.message}`,
        'MCP_RPC_ERROR',
      )));
    } else {
      pending.resolve(response.result);
    }
  }

  async request(
    method: string,
    params?: Record<string, unknown> | unknown[],
    timeout = 30_000,
  ): Promise<unknown> {
    if (!this.process || !this.process.stdin || !this.connected) {
      throw this.withStderr(new AppError('Transport not connected', 'MCP_NOT_CONNECTED'));
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(this.withStderr(new AppError(`MCP request timeout: ${method}`, 'MCP_REQUEST_TIMEOUT')));
      }, timeout);

      this.pendingRequests.set(id, {resolve, reject, timeout: timeoutHandle});

      try {
        this.process!.stdin!.write(`${JSON.stringify(request)}\n`);
      } catch (err) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(id);
        reject(this.withStderr(new AppError(
          `Failed to send MCP request: ${err instanceof Error ? err.message : String(err)}`,
          'MCP_SEND_ERROR',
        )));
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.connected = false;
    this.rejectPendingRequests(new AppError('MCP transport disconnected', 'MCP_NOT_CONNECTED'));

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process!.on('close', () => {
        clearTimeout(timeoutHandle);
        resolve();
      });

      this.process!.stdin?.end();
    });
  }

  getStderrOutput(limit = 20): string[] {
    return this.stderrLines.slice(-limit);
  }

  getConnectionDetails(): {args: string[]; command: string; connected: boolean; cwd: string; exitCode: number | null; exitSignal: string | null; pid?: number} | null {
    if (!this.connectionInfo) {
      return null;
    }

    return {
      ...this.connectionInfo,
      connected: this.connected,
      exitCode: this.exitCode,
      exitSignal: this.exitSignal,
      pid: this.process?.pid,
    };
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.process) && !this.process?.killed;
  }
}
