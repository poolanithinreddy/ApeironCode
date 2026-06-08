import {spawn, type ChildProcess} from 'node:child_process';

import {AppError} from '../utils/errors.js';

export interface LspTransportOptions {
  args: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface LspJsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface LspJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    data?: unknown;
    message: string;
  };
}

export interface LspTransportLifecycleEvent {
  type: 'spawn' | 'error' | 'close';
  error?: AppError;
  code?: number | null;
  signal?: string | null;
}

type PendingRequest = {
  reject: (reason: unknown) => void;
  resolve: (value: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type LspNotificationHandler = (notification: LspJsonRpcNotification) => void;
export type LspTransportLifecycleHandler = (event: LspTransportLifecycleEvent) => void;

const HEADER_SEPARATOR = '\r\n\r\n';

const isJsonRpcNotification = (message: unknown): message is LspJsonRpcNotification => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  return candidate.jsonrpc === '2.0'
    && typeof candidate.method === 'string'
    && !('id' in candidate);
};

const isJsonRpcResponse = (message: unknown): message is LspJsonRpcResponse => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  const hasId = typeof candidate.id === 'string' || typeof candidate.id === 'number';
  return candidate.jsonrpc === '2.0'
    && hasId
    && ('result' in candidate || 'error' in candidate);
};

const encodeMessage = (message: Record<string, unknown>): string => {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
};

const extractContentLength = (headerBlock: string): number | null => {
  const match = headerBlock.match(/Content-Length:\s*(\d+)/iu);
  if (!match) {
    return null;
  }

  const contentLength = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(contentLength) ? contentLength : null;
};

export class LspTransport {
  private connected = false;
  private notificationHandler: LspNotificationHandler | null = null;
  private readonly notificationListeners = new Set<LspNotificationHandler>();
  private readonly lifecycleListeners = new Set<LspTransportLifecycleHandler>();
  private pendingRequests = new Map<string | number, PendingRequest>();
  private process: ChildProcess | null = null;
  private requestId = 0;
  private stderrLines: string[] = [];
  private stdoutBuffer = Buffer.alloc(0);

  async connect(options: LspTransportOptions): Promise<void> {
    const {args, command, cwd = process.cwd(), env, timeout = 30_000} = options;

    try {
      this.process = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      await this.setupHandlers(timeout);
    } catch (error) {
      throw new AppError(
        `Failed to spawn LSP server: ${error instanceof Error ? error.message : String(error)}`,
        'LSP_SPAWN_ERROR',
      );
    }
  }

  private async setupHandlers(timeout: number): Promise<void> {
    const childProcess = this.process;
    if (!childProcess || !childProcess.stdout || !childProcess.stderr) {
      throw new AppError('LSP process not properly initialized', 'LSP_SETUP_ERROR');
    }
    const stdout = childProcess.stdout;
    const stderr = childProcess.stderr;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        settled = true;
        reject(this.withStderr(new AppError('LSP server initialization timeout', 'LSP_TIMEOUT')));
      }, timeout);

      const cleanup = (): void => {
        childProcess.off('spawn', onSpawn);
        childProcess.off('error', onError);
        childProcess.off('close', onClose);
        clearTimeout(timeoutHandle);
      };

      const onSpawn = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.connected = true;
        this.emitLifecycleEvent({type: 'spawn'});
        cleanup();
        resolve();
      };

      const onError = (error: Error): void => {
        const wrapped = this.withStderr(new AppError(
          `LSP process error: ${error.message}`,
          'LSP_PROCESS_ERROR',
        ));
        this.connected = false;
        this.emitLifecycleEvent({error: wrapped, type: 'error'});
        this.rejectPendingRequests(wrapped);
        if (!settled) {
          settled = true;
          cleanup();
          reject(wrapped);
        }
      };

      const onClose = (code: number | null, signal: string | null): void => {
        const wrapped = this.withStderr(new AppError(
          `LSP process exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
          'LSP_PROCESS_EXIT',
        ));
        this.connected = false;
        this.emitLifecycleEvent({code, error: wrapped, signal, type: 'close'});
        this.rejectPendingRequests(wrapped);
        if (!settled && code !== 0) {
          settled = true;
          cleanup();
          reject(wrapped);
        }
      };

      stdout.on('data', (chunk: Buffer) => {
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
        this.processMessages();
      });

      stderr.on('data', (chunk: Buffer) => {
        this.captureStderr(chunk.toString());
      });

      childProcess.once('spawn', onSpawn);
      childProcess.once('error', onError);
      childProcess.once('close', onClose);
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
      `${error.message}\nLSP stderr:\n${this.stderrLines.slice(-5).join('\n')}`,
      error.code,
    );
  }

  private processMessages(): void {
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd === -1) {
        return;
      }

      const headerBlock = this.stdoutBuffer.subarray(0, headerEnd).toString('utf8');
      const contentLength = extractContentLength(headerBlock);
      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      if (contentLength === null) {
        this.stdoutBuffer = this.stdoutBuffer.subarray(bodyStart);
        continue;
      }

      if (this.stdoutBuffer.length < bodyStart + contentLength) {
        return;
      }

      const body = this.stdoutBuffer.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
      this.stdoutBuffer = this.stdoutBuffer.subarray(bodyStart + contentLength);

      try {
        const message = JSON.parse(body) as unknown;
        this.handleMessage(message);
      } catch {
        // Ignore malformed payloads and continue parsing the stream.
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (isJsonRpcNotification(message)) {
      this.notificationHandler?.(message);
      for (const listener of this.notificationListeners) {
        listener(message);
      }
      return;
    }

    if (!isJsonRpcResponse(message)) {
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(this.withStderr(new AppError(`LSP error: ${message.error.message}`, 'LSP_RPC_ERROR')));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectPendingRequests(error: AppError): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  setNotificationHandler(handler: LspNotificationHandler | null): void {
    this.notificationHandler = handler;
  }

  onNotification(handler: LspNotificationHandler): () => void {
    this.notificationListeners.add(handler);
    return () => {
      this.notificationListeners.delete(handler);
    };
  }

  onLifecycleEvent(handler: LspTransportLifecycleHandler): () => void {
    this.lifecycleListeners.add(handler);
    return () => {
      this.lifecycleListeners.delete(handler);
    };
  }

  private emitLifecycleEvent(event: LspTransportLifecycleEvent): void {
    for (const listener of this.lifecycleListeners) {
      listener(event);
    }
  }

  async request(
    method: string,
    params?: Record<string, unknown> | unknown[],
    timeout = 30_000,
  ): Promise<unknown> {
    if (!this.process || !this.process.stdin || !this.connected) {
      throw this.withStderr(new AppError('LSP transport not connected', 'LSP_NOT_CONNECTED'));
    }

    const id = ++this.requestId;
    const payload = encodeMessage({
      id,
      jsonrpc: '2.0',
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(this.withStderr(new AppError(`LSP request timeout: ${method}`, 'LSP_REQUEST_TIMEOUT')));
      }, timeout);

      this.pendingRequests.set(id, {reject, resolve, timeout: timeoutHandle});

      try {
        this.process?.stdin?.write(payload);
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(id);
        reject(this.withStderr(new AppError(
          `Failed to send LSP request: ${error instanceof Error ? error.message : String(error)}`,
          'LSP_SEND_ERROR',
        )));
      }
    });
  }

  notify(method: string, params?: Record<string, unknown> | unknown[]): void {
    if (!this.process || !this.process.stdin || !this.connected) {
      throw this.withStderr(new AppError('LSP transport not connected', 'LSP_NOT_CONNECTED'));
    }

    this.process.stdin.write(encodeMessage({
      jsonrpc: '2.0',
      method,
      params,
    }));
  }

  async disconnect(): Promise<void> {
    const processRef = this.process;
    if (!processRef) {
      return;
    }

    this.connected = false;
    this.rejectPendingRequests(new AppError('LSP transport disconnected', 'LSP_NOT_CONNECTED'));
    this.process = null;

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        processRef.kill('SIGKILL');
        resolve();
      }, 5000);

      processRef.once('close', () => {
        clearTimeout(timeoutHandle);
        resolve();
      });

      processRef.stdin?.end();
      processRef.kill('SIGTERM');
    });
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.process) && !this.process?.killed;
  }
}