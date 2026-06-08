import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {LspDiagnosticsProvider} from '../../src/lsp/diagnostics.js';
import type {LspDetectionResult} from '../../src/lsp/types.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspDiagnosticsProvider', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(async (directory) => {
      await fs.rm(directory, {force: true, recursive: true});
    }));
  });

  const createTempFile = async (): Promise<{cwd: string; filePath: string}> => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-diagnostics-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'const value: number = "wrong";\n');
    return {cwd: tempDir, filePath};
  };

  const createStatus = (overrides?: Partial<LspDetectionResult>): LspDetectionResult => ({
    installed: true,
    language: 'TypeScript',
    serverArgs: [mockServerPath, '--publish-diagnostics'],
    serverCommand: process.execPath,
    serverName: 'mock-lsp',
    status: 'available',
    workspaceApplicable: true,
    ...overrides,
  });

  it('receives published diagnostics from the mock server', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus()),
    };
    const provider = new LspDiagnosticsProvider(manager as never);

    const result = await provider.getFileDiagnostics('example.ts', {cwd, timeout: 250});

    expect(result.source).toBe('live-lsp');
    expect(result.server).toBe('mock-lsp');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MOCK_001',
      file: 'example.ts',
      line: 2,
      message: 'Mock warning',
      severity: 'warning',
    });
  });

  it('returns fallback analysis when diagnostics publishing times out', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus({
        serverArgs: [mockServerPath, '--publish-diagnostics', '--delay-ms=200', '--delay-method=textDocument/publishDiagnostics'],
      })),
    };
    const provider = new LspDiagnosticsProvider(manager as never);

    const result = await provider.getFileDiagnostics('example.ts', {cwd, timeout: 50});

    expect(result.source).toBe('fallback-analysis');
    expect(result.diagnostics).toEqual([]);
    expect(result.reason).toMatch(/Live diagnostics failed/u);
  });

  it('prefers cached diagnostics from the long-lived session when available', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus()),
      getSessionForFile: vi.fn().mockResolvedValue({
        getDiagnostics: vi.fn().mockResolvedValue({
          cacheStatus: 'hit',
          sessionKey: 'session::typescript',
          sessionStatus: 'ready',
          source: 'cached-lsp',
          value: [{
            character: 0,
            file: 'example.ts',
            line: 2,
            message: 'Cached warning',
            severity: 'warning',
            source: 'lsp',
          }],
        }),
      }),
    };
    const provider = new LspDiagnosticsProvider(manager as never);

    const result = await provider.getFileDiagnostics('example.ts', {cwd, timeout: 250});

    expect(result.source).toBe('cached-lsp');
    expect(result.cacheStatus).toBe('hit');
    expect(result.sessionStatus).toBe('ready');
    expect(result.diagnostics[0]?.message).toBe('Cached warning');
  });

  it('returns fallback analysis when no LSP server is available', async () => {
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus({
        installed: false,
        reason: 'TypeScript LSP unavailable',
        serverArgs: undefined,
        serverCommand: undefined,
        serverName: 'typescript-language-server',
        status: 'missing',
      })),
    };
    const provider = new LspDiagnosticsProvider(manager as never);

    const result = await provider.getFileDiagnostics('src/example.ts', {cwd: process.cwd(), timeout: 50});

    expect(result).toEqual({
      diagnostics: [],
      filePath: 'src/example.ts',
      reason: 'TypeScript LSP unavailable',
      source: 'fallback-analysis',
    });
  });
});