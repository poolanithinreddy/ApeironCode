import path from 'node:path';

import {extractSymbolHints} from '../context/symbols.js';
import {formatUnknownError} from '../utils/display.js';
import {readTextFile} from '../utils/fs.js';
import {LspClient} from './client.js';
import type {LspSymbol, LspSymbolQueryResult} from './types.js';
import {LspSymbolKind} from './types.js';
import type {LspManager} from './manager.js';

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
};

const findDeclarationLocation = (content: string, symbolName: string): {character: number; kind: LspSymbolKind; line: number} | null => {
  const patterns: Array<{kind: LspSymbolKind; regex: RegExp}> = [
    {kind: LspSymbolKind.Class, regex: new RegExp(`\\bclass\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Interface, regex: new RegExp(`\\binterface\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Interface, regex: new RegExp(`\\btype\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Function, regex: new RegExp(`\\bfunction\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Function, regex: new RegExp(`\\bdef\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Function, regex: new RegExp(`\\bfunc\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Constant, regex: new RegExp(`\\bconst\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
    {kind: LspSymbolKind.Variable, regex: new RegExp(`\\b(?:let|var)\\s+${escapeRegExp(symbolName)}\\b`, 'u')},
  ];

  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match?.index !== undefined) {
        return {
          character: match.index,
          kind: pattern.kind,
          line: index + 1,
        };
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const character = line.indexOf(symbolName);
    if (character >= 0) {
      return {
        character,
        kind: LspSymbolKind.Variable,
        line: index + 1,
      };
    }
  }

  return null;
};

const buildFallbackSymbols = (content: string, filePath: string): LspSymbol[] => {
  const hints = extractSymbolHints(content, filePath);
  const symbols: Array<LspSymbol | null> = hints.symbols
    .map((symbolName) => {
      const location = findDeclarationLocation(content, symbolName);
      if (!location) {
        return null;
      }

      return {
        kind: location.kind,
        location: {
          character: location.character,
          file: filePath,
          line: location.line,
        },
        name: symbolName,
        source: 'fallback',
      };
    });

  return symbols.filter((symbol): symbol is LspSymbol => symbol !== null);
};

const toDisplayPath = (filePath: string, cwd: string): string => {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relativePath = path.relative(cwd, filePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : filePath;
};

const toResolvedPath = (filePath: string, cwd: string): string => {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
};

export class LspSymbolsProvider {
  constructor(private manager: LspManager) {}

  async getFileSymbolsDetailed(
    filePath: string,
    options?: {cwd?: string; preferLive?: boolean; timeout?: number},
  ): Promise<LspSymbolQueryResult> {
    const cwd = options?.cwd ?? process.cwd();
    const resolvedPath = toResolvedPath(filePath, cwd);
    const displayPath = toDisplayPath(filePath, cwd);
    const status = await this.manager.getFileStatus(filePath);
    const readFallbackSymbols = async (): Promise<LspSymbol[]> => {
      try {
        const content = await readTextFile(resolvedPath);
        return buildFallbackSymbols(content, displayPath);
      } catch {
        return [];
      }
    };
    const fallback = async (reason: string): Promise<LspSymbolQueryResult> => ({
      file: displayPath,
      reason,
      source: 'fallback-index',
      status,
      symbols: await readFallbackSymbols(),
    });
    const useShortLivedClient = async (): Promise<LspSymbolQueryResult> => {
      const client = new LspClient({
        cwd,
        language: status.language,
        serverArgs: status.serverArgs,
        serverCommand: status.serverCommand!,
        timeout: options?.timeout ?? 4000,
      });

      try {
        const symbols = await client.getDocumentSymbols(resolvedPath, {displayPath});
        return {
          file: displayPath,
          source: 'live-lsp',
          status,
          symbols,
        };
      } catch (error) {
        return fallback(`Live documentSymbol failed: ${formatUnknownError(error)}`);
      } finally {
        await client.dispose().catch(() => undefined);
      }
    };

    if (options?.preferLive === false) {
      return fallback('Live LSP was not requested.');
    }

    if (status.status !== 'available' || !status.serverCommand) {
      return fallback(status.reason ?? `${status.language} LSP is unavailable`);
    }

    const getSessionForFile = (this.manager as unknown as {
      getSessionForFile?: (candidatePath: string, workspaceRoot?: string) => Promise<{
        getDocumentSymbols: (candidatePath: string) => Promise<{
          value: LspSymbol[];
          source: 'live-lsp' | 'cached-lsp';
          cacheStatus: LspSymbolQueryResult['cacheStatus'];
          sessionKey: string;
          sessionStatus: LspSymbolQueryResult['sessionStatus'];
        }>;
      } | null>;
      shouldFallbackOnFailure?: () => boolean;
    }).getSessionForFile;
    const shouldFallbackOnFailure = (this.manager as unknown as {
      shouldFallbackOnFailure?: () => boolean;
    }).shouldFallbackOnFailure?.() ?? true;

    if (typeof getSessionForFile === 'function') {
      const session = await getSessionForFile(filePath, cwd).catch(() => null);
      if (session) {
        try {
          const result = await session.getDocumentSymbols(resolvedPath);
          return {
            cacheStatus: result.cacheStatus,
            file: displayPath,
            sessionKey: result.sessionKey,
            sessionStatus: result.sessionStatus,
            source: result.source,
            status,
            symbols: result.value,
          };
        } catch (error) {
          if (!shouldFallbackOnFailure) {
            return fallback(`Long-lived documentSymbol failed: ${formatUnknownError(error)}`);
          }
        }
      }
    }

    return useShortLivedClient();
  }

  async getFileSymbols(
    filePath: string,
    options?: {cwd?: string; preferLive?: boolean; timeout?: number},
  ): Promise<LspSymbol[]> {
    const result = await this.getFileSymbolsDetailed(filePath, options);
    return result.symbols;
  }

  searchSymbols(): Promise<LspSymbol[]> {
    // Placeholder: search all symbols across workspace
    // For now, return empty array - caller uses fallback repo symbol search
    return Promise.resolve([]);
  }
}
