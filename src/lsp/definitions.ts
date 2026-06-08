import path from 'node:path';

import {formatUnknownError} from '../utils/display.js';
import {LspClient} from './client.js';
import type {LspDefinitionResult, LspReferencesResult} from './types.js';
import type {LspManager} from './manager.js';

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

export class LspDefinitionsProvider {
  constructor(private manager: LspManager) {}

  async getDefinition(
    filePath: string,
    position: {line: number; character: number},
    options?: {cwd?: string; timeout?: number},
  ): Promise<LspDefinitionResult> {
    const cwd = options?.cwd ?? process.cwd();
    const resolvedPath = toResolvedPath(filePath, cwd);
    const displayPath = toDisplayPath(filePath, cwd);
    const status = await this.manager.getFileStatus(filePath);

    const fallback = (reason: string): LspDefinitionResult => ({
      source: 'fallback-unavailable',
      filePath: displayPath,
      definitions: [],
      reason,
    });
    const useShortLivedClient = async (): Promise<LspDefinitionResult> => {
      const client = new LspClient({
        cwd,
        language: status.language,
        serverArgs: status.serverArgs,
        serverCommand: status.serverCommand!,
        timeout: options?.timeout ?? 4000,
      });

      try {
        const definitions = await client.getDefinition(resolvedPath, position, {displayPath});
        return {
          source: 'live-lsp',
          filePath: displayPath,
          definitions,
        };
      } catch (error) {
        return fallback(`Live definition lookup failed: ${formatUnknownError(error)}`);
      } finally {
        await client.dispose().catch(() => undefined);
      }
    };

    if (status.status !== 'available' || !status.serverCommand) {
      return fallback(status.reason ?? `${status.language} LSP is unavailable`);
    }

    const getSessionForFile = (this.manager as unknown as {
      getSessionForFile?: (candidatePath: string, workspaceRoot?: string) => Promise<{
        getDefinition: (candidatePath: string, position: {line: number; character: number}) => Promise<{
          value: LspDefinitionResult['definitions'];
          source: 'live-lsp' | 'cached-lsp';
          cacheStatus: LspDefinitionResult['cacheStatus'];
          sessionKey: string;
          sessionStatus: LspDefinitionResult['sessionStatus'];
        }>;
        getReferences: (candidatePath: string, position: {line: number; character: number}, options?: {includeDeclaration?: boolean}) => Promise<{
          value: LspReferencesResult['references'];
          source: 'live-lsp' | 'cached-lsp';
          cacheStatus: LspReferencesResult['cacheStatus'];
          sessionKey: string;
          sessionStatus: LspReferencesResult['sessionStatus'];
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
          const result = await session.getDefinition(resolvedPath, position);
          return {
            cacheStatus: result.cacheStatus,
            definitions: result.value,
            filePath: displayPath,
            sessionKey: result.sessionKey,
            sessionStatus: result.sessionStatus,
            source: result.source,
          };
        } catch (error) {
          if (!shouldFallbackOnFailure) {
            return fallback(`Long-lived definition lookup failed: ${formatUnknownError(error)}`);
          }
        }
      }
    }

    return useShortLivedClient();
  }

  async getReferences(
    filePath: string,
    position: {line: number; character: number},
    options?: {cwd?: string; timeout?: number; includeDeclaration?: boolean},
  ): Promise<LspReferencesResult> {
    const cwd = options?.cwd ?? process.cwd();
    const resolvedPath = toResolvedPath(filePath, cwd);
    const displayPath = toDisplayPath(filePath, cwd);
    const status = await this.manager.getFileStatus(filePath);

    const fallback = (reason: string): LspReferencesResult => ({
      source: 'fallback-unavailable',
      filePath: displayPath,
      references: [],
      reason,
    });
    const useShortLivedClient = async (): Promise<LspReferencesResult> => {
      const client = new LspClient({
        cwd,
        language: status.language,
        serverArgs: status.serverArgs,
        serverCommand: status.serverCommand!,
        timeout: options?.timeout ?? 4000,
      });

      try {
        const references = await client.getReferences(resolvedPath, position, {
          displayPath,
          includeDeclaration: options?.includeDeclaration,
        });
        return {
          source: 'live-lsp',
          filePath: displayPath,
          references,
        };
      } catch (error) {
        return fallback(`Live references lookup failed: ${formatUnknownError(error)}`);
      } finally {
        await client.dispose().catch(() => undefined);
      }
    };

    if (status.status !== 'available' || !status.serverCommand) {
      return fallback(status.reason ?? `${status.language} LSP is unavailable`);
    }

    const getSessionForFile = (this.manager as unknown as {
      getSessionForFile?: (candidatePath: string, workspaceRoot?: string) => Promise<{
        getReferences: (candidatePath: string, position: {line: number; character: number}, options?: {includeDeclaration?: boolean}) => Promise<{
          value: LspReferencesResult['references'];
          source: 'live-lsp' | 'cached-lsp';
          cacheStatus: LspReferencesResult['cacheStatus'];
          sessionKey: string;
          sessionStatus: LspReferencesResult['sessionStatus'];
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
          const result = await session.getReferences(resolvedPath, position, {
            includeDeclaration: options?.includeDeclaration,
          });
          return {
            cacheStatus: result.cacheStatus,
            filePath: displayPath,
            references: result.value,
            sessionKey: result.sessionKey,
            sessionStatus: result.sessionStatus,
            source: result.source,
          };
        } catch (error) {
          if (!shouldFallbackOnFailure) {
            return fallback(`Long-lived references lookup failed: ${formatUnknownError(error)}`);
          }
        }
      }
    }

    return useShortLivedClient();
  }
}
