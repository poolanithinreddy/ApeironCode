export interface LspLanguageSupport {
  language: string;
  fileExtensions: string[];
  launchArgs?: string[];
  serverName: string;
  serverCommands: string[];
  version?: string;
}

export type LspSessionStatus = 'starting' | 'ready' | 'degraded' | 'failed' | 'stopped';

export type LspCacheMethod = 'documentSymbol' | 'diagnostics' | 'definition' | 'references';

export type LspCacheStatus = 'hit' | 'miss' | 'updated' | 'bypass';

export interface LspSessionKey {
  workspaceRoot: string;
  language: string;
  serverCommand: string;
}

export interface LspSessionSnapshot {
  key: string;
  status: LspSessionStatus;
  language: string;
  serverCommand: string;
  workspaceRoot: string;
  startedAt?: string;
  lastUsedAt?: string;
  openDocuments: number;
  diagnosticsCount: number;
  error?: string;
}

export interface LspCacheSnapshot {
  entries: number;
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
  byMethod: Partial<Record<LspCacheMethod, number>>;
}

export type LspDetectionStatus = 'available' | 'missing' | 'unsupported' | 'disabled' | 'fallback';

export interface LspDetectionResult {
  language: string;
  status: LspDetectionStatus;
  serverArgs?: string[];
  serverName?: string;
  serverCommand?: string;
  version?: string;
  installed: boolean;
  workspaceApplicable: boolean;
  installHint?: string;
  reason?: string;
}

export interface LspDiagnostic {
  file: string;
  line: number;
  character: number;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  code?: string;
  source: 'lsp' | 'fallback';
}

export interface LspSymbol {
  name: string;
  kind: LspSymbolKind;
  location: {
    file: string;
    line: number;
    character: number;
  };
  range?: {
    start: {line: number; character: number};
    end: {line: number; character: number};
  };
  source: 'lsp' | 'fallback';
}

export type LspSymbolQuerySource = 'live-lsp' | 'cached-lsp' | 'fallback-index';

export interface LspSymbolQueryResult {
  file: string;
  reason?: string;
  source: LspSymbolQuerySource;
  status: LspDetectionResult;
  symbols: LspSymbol[];
  cacheStatus?: LspCacheStatus;
  sessionKey?: string;
  sessionStatus?: LspSessionStatus;
}

export enum LspSymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export interface LspDefinition {
  file: string;
  line: number;
  character: number;
  context: string;
  source: 'lsp' | 'fallback';
}

export interface LspReference {
  file: string;
  line: number;
  character: number;
  context: string;
  source: 'lsp' | 'fallback';
}

export interface LspManagerOptions {
  enabled?: boolean;
  fallbackOnFailure?: boolean;
  timeout?: number;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  longLivedSessions?: boolean;
  idleTimeoutMs?: number;
  maxSessions?: number;
  maxConcurrent?: number;
  fallbackEnabled?: boolean;
}

export interface LspDiagnosticsResult {
  source: 'live-lsp' | 'cached-lsp' | 'fallback-analysis';
  filePath: string;
  diagnostics: LspDiagnostic[];
  reason?: string;
  server?: string;
  cacheStatus?: LspCacheStatus;
  sessionKey?: string;
  sessionStatus?: LspSessionStatus;
}

export interface LspDefinitionResult {
  source: 'live-lsp' | 'cached-lsp' | 'fallback-unavailable';
  filePath: string;
  definitions: LspDefinition[];
  reason?: string;
  cacheStatus?: LspCacheStatus;
  sessionKey?: string;
  sessionStatus?: LspSessionStatus;
}

export interface LspReferencesResult {
  source: 'live-lsp' | 'cached-lsp' | 'fallback-unavailable';
  filePath: string;
  references: LspReference[];
  reason?: string;
  cacheStatus?: LspCacheStatus;
  sessionKey?: string;
  sessionStatus?: LspSessionStatus;
}
