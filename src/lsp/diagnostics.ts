import path from 'node:path';

import {formatUnknownError} from '../utils/display.js';
import {LspClient} from './client.js';
import type {LspDiagnostic, LspDiagnosticsResult} from './types.js';
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

export class LspDiagnosticsProvider {
  constructor(private manager: LspManager) {}

  async getFileDiagnostics(
    filePath: string,
    options?: {cwd?: string; timeout?: number},
  ): Promise<LspDiagnosticsResult> {
    const cwd = options?.cwd ?? process.cwd();
    const resolvedPath = toResolvedPath(filePath, cwd);
    const displayPath = toDisplayPath(filePath, cwd);
    const status = await this.manager.getFileStatus(filePath);

    const fallback = (reason: string): LspDiagnosticsResult => ({
      source: 'fallback-analysis',
      filePath: displayPath,
      diagnostics: [],
      reason,
    });
    const useShortLivedClient = async (): Promise<LspDiagnosticsResult> => {
      const client = new LspClient({
        cwd,
        language: status.language,
        serverArgs: status.serverArgs,
        serverCommand: status.serverCommand!,
        timeout: options?.timeout ?? 4000,
      });

      try {
        const diagnostics = await client.getDiagnostics(resolvedPath, {
          displayPath,
          timeoutMs: options?.timeout ?? 3000,
        });
        return {
          source: 'live-lsp',
          filePath: displayPath,
          diagnostics,
          server: status.serverName,
        };
      } catch (error) {
        return fallback(`Live diagnostics failed: ${formatUnknownError(error)}`);
      } finally {
        await client.dispose().catch(() => undefined);
      }
    };

    if (status.status !== 'available' || !status.serverCommand) {
      return fallback(status.reason ?? `${status.language} LSP is unavailable`);
    }

    const getSessionForFile = (this.manager as unknown as {
      getSessionForFile?: (candidatePath: string, workspaceRoot?: string) => Promise<{
        getDiagnostics: (candidatePath: string) => Promise<{
          value: LspDiagnosticsResult['diagnostics'];
          source: 'live-lsp' | 'cached-lsp';
          cacheStatus: LspDiagnosticsResult['cacheStatus'];
          sessionKey: string;
          sessionStatus: LspDiagnosticsResult['sessionStatus'];
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
          const result = await session.getDiagnostics(resolvedPath);
          return {
            cacheStatus: result.cacheStatus,
            diagnostics: result.value,
            filePath: displayPath,
            server: status.serverName,
            sessionKey: result.sessionKey,
            sessionStatus: result.sessionStatus,
            source: result.source,
          };
        } catch (error) {
          if (!shouldFallbackOnFailure) {
            return fallback(`Long-lived diagnostics failed: ${formatUnknownError(error)}`);
          }
        }
      }
    }

    return useShortLivedClient();
  }

  getWorkspaceDiagnostics(): Promise<Map<string, LspDiagnostic[]>> {
    // Placeholder: aggregate diagnostics for all files
    // Out of scope for Phase 4
    return Promise.resolve(new Map<string, LspDiagnostic[]>());
  }
}
