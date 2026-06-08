import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {LspDefinitionsProvider} from '../../src/lsp/definitions.js';
import type {LspDetectionResult} from '../../src/lsp/types.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspDefinitionsProvider#getReferences', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(async (directory) => {
      await fs.rm(directory, {force: true, recursive: true});
    }));
  });

  const createTempFile = async (): Promise<{cwd: string; filePath: string}> => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-references-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export const answer = 42;\nconsole.log(answer);\n');
    return {cwd: tempDir, filePath};
  };

  const createStatus = (overrides?: Partial<LspDetectionResult>): LspDetectionResult => ({
    installed: true,
    language: 'TypeScript',
    serverArgs: [mockServerPath],
    serverCommand: process.execPath,
    serverName: 'mock-lsp',
    status: 'available',
    workspaceApplicable: true,
    ...overrides,
  });

  it('returns live references from the mock server', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus()),
    };
    const provider = new LspDefinitionsProvider(manager as never);

    const result = await provider.getReferences('example.ts', {line: 2, character: 0}, {cwd, timeout: 250});

    expect(result.source).toBe('live-lsp');
    expect(result.references).toHaveLength(2);
    expect(path.basename(result.references[0]!.file)).toBe('example.ts');
    expect(path.basename(result.references[1]!.file)).toBe('example.ts');
    expect(result.references[0]).toMatchObject({line: 11, source: 'lsp'});
    expect(result.references[1]).toMatchObject({line: 21, source: 'lsp'});
  });

  it('honors includeDeclaration when requesting references', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus()),
    };
    const provider = new LspDefinitionsProvider(manager as never);

    const result = await provider.getReferences('example.ts', {line: 2, character: 0}, {
      cwd,
      includeDeclaration: false,
      timeout: 250,
    });

    expect(result.source).toBe('live-lsp');
    expect(result.references).toHaveLength(1);
    expect(path.basename(result.references[0]!.file)).toBe('example.ts');
    expect(result.references[0]).toMatchObject({line: 21, source: 'lsp'});
  });

  it('returns fallback unavailable when no LSP server is available', async () => {
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
    const provider = new LspDefinitionsProvider(manager as never);

    const result = await provider.getReferences('src/example.ts', {line: 2, character: 0}, {cwd: process.cwd()});

    expect(result).toEqual({
      filePath: 'src/example.ts',
      reason: 'TypeScript LSP unavailable',
      references: [],
      source: 'fallback-unavailable',
    });
  });

  it('prefers cached references from the long-lived session when available', async () => {
    const {cwd} = await createTempFile();
    const manager = {
      getFileStatus: vi.fn().mockResolvedValue(createStatus()),
      getSessionForFile: vi.fn().mockResolvedValue({
        getReferences: vi.fn().mockResolvedValue({
          cacheStatus: 'hit',
          sessionKey: 'session::typescript',
          sessionStatus: 'ready',
          source: 'cached-lsp',
          value: [{
            character: 5,
            context: 'console.log(answer);',
            file: 'example.ts',
            line: 2,
            source: 'lsp',
          }],
        }),
      }),
    };
    const provider = new LspDefinitionsProvider(manager as never);

    const result = await provider.getReferences('example.ts', {line: 2, character: 0}, {cwd, timeout: 250});

    expect(result.source).toBe('cached-lsp');
    expect(result.cacheStatus).toBe('hit');
    expect(result.sessionStatus).toBe('ready');
    expect(result.references[0]?.line).toBe(2);
  });
});