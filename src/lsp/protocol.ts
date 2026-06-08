import {fileURLToPath} from 'node:url';

import {inferLanguageFromPath} from '../context/symbols.js';
import {AppError} from '../utils/errors.js';
import {LspSymbolKind, type LspDefinition, type LspDiagnostic, type LspReference, type LspSymbol} from './types.js';

export interface LspInitializeResult {
  capabilities?: Record<string, unknown>;
  serverInfo?: {
    name?: string;
    version?: string;
  };
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDocumentSymbol {
  children?: LspDocumentSymbol[];
  kind: number;
  name: string;
  range: LspRange;
  selectionRange?: LspRange;
}

export interface LspSymbolInformation {
  kind: number;
  location: {
    range: LspRange;
    uri: string;
  };
  name: string;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDiagnosticRaw {
  range: LspRange;
  severity?: number;
  code?: string | number;
  message: string;
  source?: string;
}

export interface LspLocationLink {
  originSelectionRange?: LspRange;
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
}

export const toLanguageId = (language: string, filePath: string): string => {
  switch (language) {
    case 'Go':
      return 'go';
    case 'Java':
      return 'java';
    case 'JavaScript':
      return 'javascript';
    case 'Python':
      return 'python';
    case 'Rust':
      return 'rust';
    case 'TypeScript':
      return 'typescript';
    default:
      return inferLanguageFromPath(filePath).toLowerCase();
  }
};

const isPosition = (value: unknown): value is LspPosition => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.line) && Number.isFinite(candidate.character);
};

const isRange = (value: unknown): value is LspRange => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return isPosition(candidate.start) && isPosition(candidate.end);
};

export const isInitializeResult = (value: unknown): value is LspInitializeResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return !('capabilities' in candidate) || typeof candidate.capabilities === 'object';
};

const isDocumentSymbol = (value: unknown): value is LspDocumentSymbol => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string'
    && Number.isFinite(candidate.kind)
    && isRange(candidate.range)
    && (!('selectionRange' in candidate) || isRange(candidate.selectionRange));
};

const isSymbolInformation = (value: unknown): value is LspSymbolInformation => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const location = candidate.location as Record<string, unknown> | undefined;
  return typeof candidate.name === 'string'
    && Number.isFinite(candidate.kind)
    && Boolean(location)
    && typeof location?.uri === 'string'
    && isRange(location?.range);
};

const toSymbolKind = (value: number): LspSymbolKind => {
  return value >= 1 && value <= 26 ? value : LspSymbolKind.Variable;
};

export const resolveResultFilePath = (uri: string, fallbackPath: string): string => {
  if (!uri.startsWith('file:')) {
    return fallbackPath;
  }

  try {
    return fileURLToPath(uri);
  } catch {
    return fallbackPath;
  }
};

const flattenDocumentSymbols = (symbols: LspDocumentSymbol[], fallbackPath: string): LspSymbol[] => {
  const results: LspSymbol[] = [];

  const visit = (symbol: LspDocumentSymbol): void => {
    const location = symbol.selectionRange?.start ?? symbol.range.start;
    results.push({
      kind: toSymbolKind(symbol.kind),
      location: {
        character: location.character,
        file: fallbackPath,
        line: location.line + 1,
      },
      name: symbol.name,
      range: {
        end: {
          character: symbol.range.end.character,
          line: symbol.range.end.line + 1,
        },
        start: {
          character: symbol.range.start.character,
          line: symbol.range.start.line + 1,
        },
      },
      source: 'lsp',
    });

    for (const child of symbol.children ?? []) {
      visit(child);
    }
  };

  for (const symbol of symbols) {
    visit(symbol);
  }

  return results;
};

const mapSymbolInformation = (symbols: LspSymbolInformation[], fallbackPath: string): LspSymbol[] => {
  return symbols.map((symbol) => ({
    kind: toSymbolKind(symbol.kind),
    location: {
      character: symbol.location.range.start.character,
      file: resolveResultFilePath(symbol.location.uri, fallbackPath),
      line: symbol.location.range.start.line + 1,
    },
    name: symbol.name,
    range: {
      end: {
        character: symbol.location.range.end.character,
        line: symbol.location.range.end.line + 1,
      },
      start: {
        character: symbol.location.range.start.character,
        line: symbol.location.range.start.line + 1,
      },
    },
    source: 'lsp',
  }));
};

export const mapDocumentSymbolResult = (value: unknown, fallbackPath: string): LspSymbol[] => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AppError('Invalid documentSymbol response: expected an array', 'LSP_DOCUMENT_SYMBOL_INVALID');
  }

  if (value.every((item) => isDocumentSymbol(item))) {
    return flattenDocumentSymbols(value, fallbackPath);
  }

  if (value.every((item) => isSymbolInformation(item))) {
    return mapSymbolInformation(value, fallbackPath);
  }

  throw new AppError('Invalid documentSymbol response: unsupported payload shape', 'LSP_DOCUMENT_SYMBOL_INVALID');
};

export const isLocation = (value: unknown): value is LspLocation => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.uri === 'string' && isRange(candidate.range);
};

export const isLocationLink = (value: unknown): value is LspLocationLink => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.targetUri === 'string' && isRange(candidate.targetRange);
};

export const isDiagnosticRaw = (value: unknown): value is LspDiagnosticRaw => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return isRange(candidate.range) && typeof candidate.message === 'string';
};

export const severityNumberToLabel = (severity?: number): 'error' | 'warning' | 'information' | 'hint' => {
  switch (severity) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'information';
    case 4:
      return 'hint';
    default:
      return 'information';
  }
};

export const mapLocationToDiagnostic = (
  loc: LspLocation,
  filePath: string,
  severity: 'error' | 'warning' | 'information' | 'hint',
  message: string,
  code?: string | number,
): LspDiagnostic => ({
  file: filePath,
  line: loc.range.start.line + 1,
  character: loc.range.start.character,
  severity,
  message,
  code: code ? String(code) : undefined,
  source: 'lsp',
});

export const mapLocationToDefinition = (loc: LspLocation, filePath: string): LspDefinition => ({
  file: filePath,
  line: loc.range.start.line + 1,
  character: loc.range.start.character,
  context: '',
  source: 'lsp',
});

export const mapLocationToReference = (loc: LspLocation, filePath: string): LspReference => ({
  file: filePath,
  line: loc.range.start.line + 1,
  character: loc.range.start.character,
  context: '',
  source: 'lsp',
});
