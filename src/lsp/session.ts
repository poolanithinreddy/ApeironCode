import {pathToFileURL} from 'node:url';

import {formatUnknownError} from '../utils/display.js';
import {LspCache} from './cache.js';
import {LspDocumentStore, type LspDocumentRecord, type LspDocumentSyncPlan} from './documentStore.js';
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
} from './protocol.js';
import {resolveFilePath, resolveWorkspacePath, toDisplayPath, toServerId} from './sessionPaths.js';
import {LspTransport} from './transport.js';
import type {
  LspCacheStatus,
  LspDefinition,
  LspDiagnostic,
  LspReference,
  LspSessionKey,
  LspSessionSnapshot,
  LspSessionStatus,
  LspSymbol,
} from './types.js';

interface LspSessionOptions {
  workspaceRoot: string;
  language: string;
  serverCommand: string;
  serverArgs?: string[];
  startupTimeoutMs: number;
  requestTimeoutMs: number;
  transport?: LspTransport;
}

type DiagnosticsWaiter = {
  resolve: (value: LspDiagnostic[]) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SessionQueryResult<TValue, TSource extends 'live-lsp' | 'cached-lsp'> = {
  value: TValue;
  source: TSource;
  cacheStatus: LspCacheStatus;
  sessionKey: string;
  sessionStatus: LspSessionStatus;
};

export class LspSession {
  private readonly cache = new LspCache();
  private readonly diagnosticsByFile = new Map<string, number>();
  private readonly diagnosticsWaiters = new Map<string, DiagnosticsWaiter[]>();
  private readonly documentStore = new LspDocumentStore();
  private readonly notificationCounts = {
    didChange: 0,
    didClose: 0,
    didOpen: 0,
  };
  private readonly serverId: string;
  private readonly transport: LspTransport;
  private controlledShutdown = false;
  private error?: string;
  private lastUsedAt?: string;
  private startedAt?: string;
  private startPromise: Promise<void> | null = null;
  private status: LspSessionStatus = 'stopped';

  constructor(private readonly options: LspSessionOptions) {
    this.serverId = toServerId(options);
    this.transport = options.transport ?? new LspTransport();
    this.transport.onLifecycleEvent((event) => {
      if (this.controlledShutdown) {
        return;
      }

      if (event.type === 'error' || event.type === 'close') {
        this.status = 'degraded';
        this.error = event.error?.message ?? 'LSP session closed unexpectedly';
      }
    });
    this.transport.onNotification((notification) => {
      if (notification.method !== 'textDocument/publishDiagnostics') {
        return;
      }

      this.handleDiagnosticsNotification(notification.params as Record<string, unknown> | undefined);
    });
  }

  get key(): LspSessionKey {
    return {
      language: this.options.language,
      serverCommand: this.options.serverCommand,
      workspaceRoot: this.options.workspaceRoot,
    };
  }

  get keyString(): string {
    return `${this.options.workspaceRoot}::${this.options.language}::${this.options.serverCommand}`;
  }

  getSnapshot(): LspSessionSnapshot {
    return {
      diagnosticsCount: Array.from(this.diagnosticsByFile.values()).reduce((sum, value) => sum + value, 0),
      error: this.error,
      key: this.keyString,
      language: this.options.language,
      lastUsedAt: this.lastUsedAt,
      openDocuments: this.documentStore.size(),
      serverCommand: this.options.serverCommand,
      startedAt: this.startedAt,
      status: this.status,
      workspaceRoot: this.options.workspaceRoot,
    };
  }

  getCacheSnapshot() {
    return this.cache.getSnapshot();
  }

  getNotificationCounts(): {didOpen: number; didChange: number; didClose: number} {
    return {...this.notificationCounts};
  }

  isIdle(now = Date.now(), idleTimeoutMs = 300_000): boolean {
    if (!this.lastUsedAt) {
      return false;
    }

    return now - new Date(this.lastUsedAt).getTime() >= idleTimeoutMs;
  }

  hasLanguage(language?: string): boolean {
    return !language || this.options.language === language;
  }

  invalidateFile(filePath: string): void {
    this.cache.invalidateFile(filePath);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async ensureReady(): Promise<void> {
    this.touch();

    if (this.transport.isConnected()) {
      this.status = 'ready';
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async restart(): Promise<void> {
    await this.shutdown();
    await this.ensureReady();
  }

  async shutdown(): Promise<void> {
    this.controlledShutdown = true;

    for (const document of this.documentStore.closeAll()) {
      if (this.transport.isConnected()) {
        try {
          this.transport.notify('textDocument/didClose', {
            textDocument: {uri: document.uri},
          });
          this.notificationCounts.didClose += 1;
        } catch {
          // Best effort during shutdown.
        }
      }
    }

    if (this.transport.isConnected()) {
      try {
        await this.transport.request('shutdown', undefined, this.options.requestTimeoutMs);
      } catch {
        // Best effort during shutdown.
      }

      try {
        this.transport.notify('exit');
      } catch {
        // Best effort during shutdown.
      }
    }

    await this.transport.disconnect().catch(() => undefined);
    this.rejectDiagnosticsWaiters(new Error('LSP session stopped'));
    this.status = 'stopped';
    this.error = undefined;
    this.controlledShutdown = false;
  }

  async getDocumentSymbols(filePath: string): Promise<SessionQueryResult<LspSymbol[], 'live-lsp' | 'cached-lsp'>> {
    await this.ensureReady();
    const prepared = await this.prepareDocument(filePath, {forceSync: false});
    const cacheLookup = {
      contentHash: prepared.record.contentHash,
      filePath: prepared.record.filePath,
      method: 'documentSymbol' as const,
      serverId: this.serverId,
    };
    const cached = this.cache.get<LspSymbol[]>(cacheLookup);
    if (cached) {
      return this.buildQueryResult(cached, 'cached-lsp', 'hit');
    }

    this.applyDocumentSync(prepared);
    try {
      const result = await this.transport.request('textDocument/documentSymbol', {
        textDocument: {uri: prepared.record.uri},
      }, this.options.requestTimeoutMs);
      const symbols = mapDocumentSymbolResult(result, prepared.displayPath);
      this.cache.set(cacheLookup, symbols);
      return this.buildQueryResult(symbols, 'live-lsp', 'miss');
    } catch (error) {
      this.markFailure(error);
      throw error;
    }
  }

  async getDiagnostics(filePath: string): Promise<SessionQueryResult<LspDiagnostic[], 'live-lsp' | 'cached-lsp'>> {
    await this.ensureReady();
    const resolvedPath = resolveWorkspacePath(this.options.workspaceRoot, filePath);
    const prepared = await this.prepareDocument(filePath, {
      forceSync: Boolean(this.documentStore.get(resolvedPath)),
    });
    const cacheLookup = {
      contentHash: prepared.record.contentHash,
      filePath: prepared.record.filePath,
      method: 'diagnostics' as const,
      serverId: this.serverId,
    };
    const cached = this.cache.get<LspDiagnostic[]>(cacheLookup);
    if (cached) {
      return this.buildQueryResult(cached, 'cached-lsp', 'hit');
    }

    const diagnosticsPromise = this.waitForDiagnostics(prepared.record.filePath);
    this.applyDocumentSync(prepared);
    try {
      const diagnostics = await diagnosticsPromise;
      return this.buildQueryResult(diagnostics, 'live-lsp', 'miss');
    } catch (error) {
      this.markFailure(error);
      throw error;
    }
  }

  async getDefinition(
    filePath: string,
    position: {line: number; character: number},
  ): Promise<SessionQueryResult<LspDefinition[], 'live-lsp' | 'cached-lsp'>> {
    await this.ensureReady();
    const prepared = await this.prepareDocument(filePath, {forceSync: false});
    const cacheLookup = {
      contentHash: prepared.record.contentHash,
      extraKey: `${position.line}:${position.character}`,
      filePath: prepared.record.filePath,
      method: 'definition' as const,
      serverId: this.serverId,
    };
    const cached = this.cache.get<LspDefinition[]>(cacheLookup);
    if (cached) {
      return this.buildQueryResult(cached, 'cached-lsp', 'hit');
    }

    this.applyDocumentSync(prepared);
    try {
      const result = await this.transport.request('textDocument/definition', {
        position: {
          character: position.character,
          line: position.line - 1,
        },
        textDocument: {uri: prepared.record.uri},
      }, this.options.requestTimeoutMs);
      const definitions = this.mapDefinitions(result, prepared.displayPath);
      this.cache.set(cacheLookup, definitions);
      return this.buildQueryResult(definitions, 'live-lsp', 'miss');
    } catch (error) {
      this.markFailure(error);
      throw error;
    }
  }

  async getReferences(
    filePath: string,
    position: {line: number; character: number},
    options?: {includeDeclaration?: boolean},
  ): Promise<SessionQueryResult<LspReference[], 'live-lsp' | 'cached-lsp'>> {
    await this.ensureReady();
    const prepared = await this.prepareDocument(filePath, {forceSync: false});
    const cacheLookup = {
      contentHash: prepared.record.contentHash,
      extraKey: `${position.line}:${position.character}:${options?.includeDeclaration ?? true}`,
      filePath: prepared.record.filePath,
      method: 'references' as const,
      serverId: this.serverId,
    };
    const cached = this.cache.get<LspReference[]>(cacheLookup);
    if (cached) {
      return this.buildQueryResult(cached, 'cached-lsp', 'hit');
    }

    this.applyDocumentSync(prepared);
    try {
      const result = await this.transport.request('textDocument/references', {
        context: {
          includeDeclaration: options?.includeDeclaration ?? true,
        },
        position: {
          character: position.character,
          line: position.line - 1,
        },
        textDocument: {uri: prepared.record.uri},
      }, this.options.requestTimeoutMs);
      const references = this.mapReferences(result, prepared.displayPath);
      this.cache.set(cacheLookup, references);
      return this.buildQueryResult(references, 'live-lsp', 'miss');
    } catch (error) {
      this.markFailure(error);
      throw error;
    }
  }

  private async start(): Promise<void> {
    this.status = 'starting';
    this.error = undefined;
    this.controlledShutdown = false;

    try {
      await this.transport.connect({
        args: this.options.serverArgs ?? [],
        command: this.options.serverCommand,
        cwd: this.options.workspaceRoot,
        timeout: this.options.startupTimeoutMs,
      });
      const result = await this.transport.request('initialize', {
        capabilities: {
          textDocument: {
            definition: {},
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            publishDiagnostics: {},
            references: {},
            synchronization: {
              didClose: true,
              didOpen: true,
              willSave: false,
            },
          },
          workspace: {},
        },
        clientInfo: {
          name: 'apeironcode-agent',
          version: '0.1.0',
        },
        processId: process.pid,
        rootUri: pathToFileURL(this.options.workspaceRoot).href,
      }, this.options.startupTimeoutMs);

      if (!isInitializeResult(result)) {
        throw new Error('Invalid initialize response from LSP server');
      }

      this.transport.notify('initialized', {});
      this.status = 'ready';
      this.startedAt = new Date().toISOString();
      this.touch();
    } catch (error) {
      this.status = 'failed';
      this.error = formatUnknownError(error);
      await this.transport.disconnect().catch(() => undefined);
      throw error;
    }
  }

  private async prepareDocument(
    filePath: string,
    options?: {forceSync?: boolean},
  ): Promise<{record: LspDocumentRecord; plan: LspDocumentSyncPlan; displayPath: string}> {
    const resolvedPath = resolveWorkspacePath(this.options.workspaceRoot, filePath);
    const plan = await this.documentStore.planSync(
      resolvedPath,
      toLanguageId(this.options.language, resolvedPath),
      {forceSync: options?.forceSync},
    );
    return {
      displayPath: toDisplayPath(resolvedPath, this.options.workspaceRoot),
      plan,
      record: plan.record,
    };
  }

  private applyDocumentSync(prepared: {record: LspDocumentRecord; plan: LspDocumentSyncPlan}): void {
    this.touch();
    if (prepared.plan.state === 'unchanged') {
      return;
    }

    try {
      if (prepared.plan.state === 'opened') {
        this.transport.notify('textDocument/didOpen', {
          textDocument: {
            languageId: prepared.record.languageId,
            text: prepared.plan.text,
            uri: prepared.record.uri,
            version: prepared.record.version,
          },
        });
        this.notificationCounts.didOpen += 1;
      } else {
        this.cache.invalidateFile(prepared.record.filePath);
        this.transport.notify('textDocument/didChange', {
          contentChanges: [{text: prepared.plan.text}],
          textDocument: {
            uri: prepared.record.uri,
            version: prepared.record.version,
          },
        });
        this.notificationCounts.didChange += 1;
      }

      this.documentStore.commitSync(prepared.plan);
    } catch (error) {
      this.markFailure(error);
      throw error;
    }
  }

  private handleDiagnosticsNotification(params?: Record<string, unknown>): void {
    const uri = typeof params?.uri === 'string' ? params.uri : null;
    if (!uri) {
      return;
    }

    const document = this.documentStore.getByUri(uri);
    if (!document) {
      return;
    }

    const rawDiagnostics = params?.diagnostics;
    const displayPath = toDisplayPath(document.filePath, this.options.workspaceRoot);
    const diagnostics = Array.isArray(rawDiagnostics)
      ? rawDiagnostics
          .filter((item) => isDiagnosticRaw(item))
          .map((item) => mapLocationToDiagnostic(
            {range: item.range, uri},
            displayPath,
            severityNumberToLabel(item.severity),
            item.message,
            item.code,
          ))
      : [];

    this.cache.set({
      contentHash: document.contentHash,
      filePath: document.filePath,
      method: 'diagnostics',
      serverId: this.serverId,
    }, diagnostics);
    this.diagnosticsByFile.set(document.filePath, diagnostics.length);

    const waiters = this.diagnosticsWaiters.get(document.filePath) ?? [];
    this.diagnosticsWaiters.delete(document.filePath);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(diagnostics);
    }
  }

  private waitForDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
    const resolvedPath = resolveFilePath(filePath);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const current = this.diagnosticsWaiters.get(resolvedPath) ?? [];
        this.diagnosticsWaiters.set(
          resolvedPath,
          current.filter((waiter) => waiter.resolve !== resolve),
        );
        reject(new Error('Timed out waiting for textDocument/publishDiagnostics'));
      }, this.options.requestTimeoutMs);

      const waiters = this.diagnosticsWaiters.get(resolvedPath) ?? [];
      waiters.push({
        reject,
        resolve,
        timeout,
      });
      this.diagnosticsWaiters.set(resolvedPath, waiters);
    });
  }

  private rejectDiagnosticsWaiters(error: Error): void {
    for (const waiters of this.diagnosticsWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
    this.diagnosticsWaiters.clear();
  }

  private mapDefinitions(result: unknown, displayPath: string): LspDefinition[] {
    if (result == null) {
      return [];
    }

    if (isLocation(result)) {
      const filePath = resolveResultFilePath(result.uri, displayPath);
      return [mapLocationToDefinition(result, filePath)];
    }

    if (!Array.isArray(result)) {
      return [];
    }

    return result.flatMap((item) => {
      if (isLocation(item)) {
        const filePath = resolveResultFilePath(item.uri, displayPath);
        return [mapLocationToDefinition(item, filePath)];
      }

      if (isLocationLink(item)) {
        const location = {range: item.targetRange, uri: item.targetUri};
        const filePath = resolveResultFilePath(location.uri, displayPath);
        return [mapLocationToDefinition(location, filePath)];
      }

      return [];
    });
  }

  private mapReferences(result: unknown, displayPath: string): LspReference[] {
    if (!Array.isArray(result)) {
      return [];
    }

    return result.flatMap((item) => {
      if (!isLocation(item)) {
        return [];
      }

      const filePath = resolveResultFilePath(item.uri, displayPath);
      return [mapLocationToReference(item, filePath)];
    });
  }

  private buildQueryResult<TValue, TSource extends 'live-lsp' | 'cached-lsp'>(
    value: TValue,
    source: TSource,
    cacheStatus: LspCacheStatus,
  ): SessionQueryResult<TValue, TSource> {
    return {
      cacheStatus,
      sessionKey: this.keyString,
      sessionStatus: this.status,
      source,
      value,
    };
  }

  private markFailure(error: unknown): void {
    this.status = 'degraded';
    this.error = formatUnknownError(error);
  }

  private touch(): void {
    this.lastUsedAt = new Date().toISOString();
  }
}
