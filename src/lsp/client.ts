import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {formatUnknownError} from '../utils/display.js';
import {AppError} from '../utils/errors.js';
import {readTextFile} from '../utils/fs.js';
import {
  isDiagnosticRaw,
  isInitializeResult,
  isLocation,
  isLocationLink,
  mapDocumentSymbolResult,
  mapLocationToDefinition,
  mapLocationToDiagnostic,
  mapLocationToReference,
  resolveResultFilePath,
  severityNumberToLabel,
  toLanguageId,
  type LspDiagnosticRaw,
  type LspLocation,
} from './protocol.js';
import {LspTransport} from './transport.js';
import type {LspDiagnostic, LspDefinition, LspReference, LspSymbol} from './types.js';
export {
  isDiagnosticRaw,
  isInitializeResult,
  isLocation,
  isLocationLink,
  mapDocumentSymbolResult,
  mapLocationToDefinition,
  mapLocationToDiagnostic,
  mapLocationToReference,
  resolveResultFilePath,
  severityNumberToLabel,
  toLanguageId,
} from './protocol.js';
export type {
  LspDiagnosticRaw,
  LspDocumentSymbol,
  LspInitializeResult,
  LspLocation,
  LspLocationLink,
  LspPosition,
  LspRange,
  LspSymbolInformation,
} from './protocol.js';

interface LspClientOptions {
  cwd: string;
  language: string;
  serverArgs?: string[];
  serverCommand: string;
  timeout?: number;
  transport?: LspTransport;
}

export class LspClient {
  private capabilities: Record<string, unknown> | null = null;
  private initialized = false;
  private readonly openedDocuments = new Set<string>();
  private readonly timeout: number;
  private readonly transport: LspTransport;

  constructor(private options: LspClientOptions) {
    this.timeout = options.timeout ?? 5000;
    this.transport = options.transport ?? new LspTransport();
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCapabilities(): Record<string, unknown> | null {
    return this.capabilities;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (!this.transport.isConnected()) {
        await this.transport.connect({
          args: this.options.serverArgs ?? [],
          command: this.options.serverCommand,
          cwd: this.options.cwd,
          timeout: this.timeout,
        });
      }

      const result = await this.transport.request('initialize', {
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            publishDiagnostics: {},
            definition: {},
            references: {},
          },
        },
        clientInfo: {
          name: 'apeironcode-agent',
          version: '0.1.0',
        },
        processId: process.pid,
        rootUri: pathToFileURL(this.options.cwd).href,
      }, this.timeout);

      if (!isInitializeResult(result)) {
        throw new AppError('Invalid initialize response from LSP server', 'LSP_INIT_INVALID');
      }

      this.capabilities = result.capabilities ?? null;
      this.initialized = true;
      this.notifyInitialized();
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to initialize LSP client: ${formatUnknownError(error)}`, 'LSP_INIT_ERROR');
    }
  }

  notifyInitialized(): void {
    if (!this.transport.isConnected() || !this.initialized) {
      throw new AppError('LSP client is not initialized', 'LSP_NOT_INITIALIZED');
    }

    this.transport.notify('initialized', {});
  }

  async didOpenTextDocument(filePath: string, text?: string): Promise<string> {
    const resolvedPath = this.resolveFilePath(filePath);
    const uri = pathToFileURL(resolvedPath).href;

    if (this.openedDocuments.has(uri)) {
      return uri;
    }

    await this.initialize();

    try {
      const documentText = text ?? await readTextFile(resolvedPath);
      this.transport.notify('textDocument/didOpen', {
        textDocument: {
          languageId: toLanguageId(this.options.language, resolvedPath),
          text: documentText,
          uri,
          version: 1,
        },
      });
      this.openedDocuments.add(uri);
      return uri;
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to open document for LSP: ${formatUnknownError(error)}`, 'LSP_DID_OPEN_ERROR');
    }
  }

  async getDocumentSymbols(
    filePath: string,
    options?: {displayPath?: string; text?: string},
  ): Promise<LspSymbol[]> {
    const resolvedPath = this.resolveFilePath(filePath);
    const displayPath = options?.displayPath ?? filePath;

    try {
      const uri = await this.didOpenTextDocument(resolvedPath, options?.text);
      const result = await this.transport.request('textDocument/documentSymbol', {
        textDocument: {
          uri,
        },
      }, this.timeout);
      return mapDocumentSymbolResult(result, displayPath);
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to get document symbols: ${formatUnknownError(error)}`, 'LSP_DOCUMENT_SYMBOL_ERROR');
    }
  }

  async getDiagnostics(
    filePath: string,
    options?: {displayPath?: string; text?: string; timeoutMs?: number},
  ): Promise<LspDiagnostic[]> {
    const resolvedPath = this.resolveFilePath(filePath);
    const displayPath = options?.displayPath ?? filePath;
    const timeoutMs = options?.timeoutMs ?? 2000;

    try {
      await this.didOpenTextDocument(resolvedPath, options?.text);

      const diagnostics = await new Promise<LspDiagnostic[]>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          this.transport.setNotificationHandler(null);
          reject(new Error('Timed out waiting for textDocument/publishDiagnostics'));
        }, timeoutMs);

        this.transport.setNotificationHandler((notification) => {
          if (notification.method === 'textDocument/publishDiagnostics') {
            clearTimeout(timeoutHandle);
            this.transport.setNotificationHandler(null);

            const publishParams = notification.params as Record<string, unknown> | undefined;
            const rawDiagnostics = publishParams?.diagnostics;
            if (!Array.isArray(rawDiagnostics)) {
              resolve([]);
              return;
            }

            const mapped = rawDiagnostics
              .filter((item) => isDiagnosticRaw(item))
              .map((item: LspDiagnosticRaw) =>
                mapLocationToDiagnostic(
                  {uri: publishParams?.uri as string || '', range: item.range},
                  displayPath,
                  severityNumberToLabel(item.severity),
                  item.message,
                  item.code,
                ),
              );
            resolve(mapped);
          }
        });
      });

      return diagnostics;
    } catch (error) {
      this.transport.setNotificationHandler(null);
      await this.forceDisconnect();
      throw new AppError(`Failed to get diagnostics: ${formatUnknownError(error)}`, 'LSP_DIAGNOSTICS_ERROR');
    }
  }

  async getDefinition(
    filePath: string,
    position: {line: number; character: number},
    options?: {displayPath?: string},
  ): Promise<LspDefinition[]> {
    const resolvedPath = this.resolveFilePath(filePath);
    const displayPath = options?.displayPath ?? filePath;

    try {
      const docUri = await this.didOpenTextDocument(resolvedPath);
      const result = await this.transport.request('textDocument/definition', {
        textDocument: {uri: docUri},
        position: {
          line: position.line - 1,
          character: position.character,
        },
      }, this.timeout);

      if (result == null) {
        return [];
      }

      if (isLocation(result)) {
        const filePath = resolveResultFilePath(result.uri, displayPath);
        return [mapLocationToDefinition(result, filePath)];
      }

      if (Array.isArray(result)) {
        return result.flatMap((item) => {
          if (isLocation(item)) {
            const defFilePath = resolveResultFilePath(item.uri, displayPath);
            return [mapLocationToDefinition(item, defFilePath)];
          }

          if (isLocationLink(item)) {
            const loc: LspLocation = {uri: item.targetUri, range: item.targetRange};
            const defFilePath = resolveResultFilePath(loc.uri, displayPath);
            return [mapLocationToDefinition(loc, defFilePath)];
          }

          return [];
        });
      }

      return [];
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to get definition: ${formatUnknownError(error)}`, 'LSP_DEFINITION_ERROR');
    }
  }

  async getReferences(
    filePath: string,
    position: {line: number; character: number},
    options?: {displayPath?: string; includeDeclaration?: boolean},
  ): Promise<LspReference[]> {
    const resolvedPath = this.resolveFilePath(filePath);
    const displayPath = options?.displayPath ?? filePath;

    try {
      const docUri = await this.didOpenTextDocument(resolvedPath);
      const result = await this.transport.request('textDocument/references', {
        textDocument: {uri: docUri},
        position: {
          line: position.line - 1,
          character: position.character,
        },
        context: {
          includeDeclaration: options?.includeDeclaration ?? true,
        },
      }, this.timeout);

      if (result == null || !Array.isArray(result)) {
        return [];
      }

      return result.flatMap((item) => {
        if (!isLocation(item)) {
          return [];
        }

        const refFilePath = resolveResultFilePath(item.uri, displayPath);
        return [mapLocationToReference(item, refFilePath)];
      });
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to get references: ${formatUnknownError(error)}`, 'LSP_REFERENCES_ERROR');
    }
  }

  async shutdown(): Promise<void> {
    if (!this.transport.isConnected()) {
      this.initialized = false;
      this.openedDocuments.clear();
      return;
    }

    try {
      if (this.initialized) {
        await this.transport.request('shutdown', undefined, this.timeout);
      }
    } catch (error) {
      await this.forceDisconnect();
      throw new AppError(`Failed to shutdown LSP client: ${formatUnknownError(error)}`, 'LSP_SHUTDOWN_ERROR');
    } finally {
      this.initialized = false;
      this.openedDocuments.clear();
    }
  }

  async exit(): Promise<void> {
    if (!this.transport.isConnected()) {
      return;
    }

    try {
      this.transport.notify('exit');
    } catch {
      // Best effort; disconnect still owns final cleanup.
    }

    await this.transport.disconnect();
    this.initialized = false;
    this.openedDocuments.clear();
  }

  async dispose(): Promise<void> {
    let shutdownError: unknown = null;

    try {
      await this.shutdown();
    } catch (error) {
      shutdownError = error;
    }

    await this.exit();

    if (shutdownError) {
      if (shutdownError instanceof Error) {
        throw shutdownError;
      }

      const message = typeof shutdownError === 'string'
        ? shutdownError
        : 'Unknown LSP shutdown error';
      throw new Error(message);
    }
  }

  private async forceDisconnect(): Promise<void> {
    this.initialized = false;
    this.openedDocuments.clear();
    await this.transport.disconnect().catch(() => undefined);
  }

  private resolveFilePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(this.options.cwd, filePath);
  }
}
