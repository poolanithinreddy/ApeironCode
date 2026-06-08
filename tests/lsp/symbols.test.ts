import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {LspSymbolKind} from '../../src/lsp/types.js';
import {LspSymbolsProvider} from '../../src/lsp/symbols.js';
import type {LspManager} from '../../src/lsp/manager.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspSymbolsProvider', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (tempDir) => {
      await fs.rm(tempDir, {force: true, recursive: true});
    }));
  });

  it('returns fallback symbols extracted from source files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-symbols-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, [
      'export class Widget {}',
      'export function runAgentLoop() {',
      '  return true;',
      '}',
      'const helperValue = 1;',
    ].join('\n'));

    const manager = {
      getFileStatus: vi.fn(() => Promise.resolve({
        installed: false,
        language: 'TypeScript',
        status: 'missing',
        workspaceApplicable: true,
      })),
    } as unknown as LspManager;

    const provider = new LspSymbolsProvider(manager);
    const result = await provider.getFileSymbolsDetailed(filePath, {cwd: tempDir});
    const symbols = result.symbols;

    expect(symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(['Widget', 'runAgentLoop']));
    expect(symbols.find((symbol) => symbol.name === 'Widget')?.kind).toBe(LspSymbolKind.Class);
    expect(symbols.find((symbol) => symbol.name === 'runAgentLoop')?.kind).toBe(LspSymbolKind.Function);
    expect(symbols.every((symbol) => symbol.source === 'fallback')).toBe(true);
    expect(result.source).toBe('fallback-index');
  });

  it('returns live LSP symbols when the server is available', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-symbols-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export function runAgentLoop() {}\n');

    const manager = {
      getFileStatus: vi.fn(() => Promise.resolve({
        installed: true,
        language: 'TypeScript',
        serverArgs: [mockServerPath],
        serverCommand: process.execPath,
        serverName: 'mock-lsp',
        status: 'available',
        workspaceApplicable: true,
      })),
    } as unknown as LspManager;

    const provider = new LspSymbolsProvider(manager);
    const result = await provider.getFileSymbolsDetailed(filePath, {cwd: tempDir, timeout: 250});

    expect(result.source).toBe('live-lsp');
    expect(result.reason).toBeUndefined();
    expect(result.symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(['MockAgent', 'run', 'runAgentLoop']));
    expect(result.symbols.every((symbol) => symbol.source === 'lsp')).toBe(true);
  });

  it('prefers the long-lived session result when available', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-symbols-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export function runAgentLoop() {}\n');

    const manager = {
      getFileStatus: vi.fn(() => Promise.resolve({
        installed: true,
        language: 'TypeScript',
        serverArgs: [mockServerPath],
        serverCommand: process.execPath,
        serverName: 'mock-lsp',
        status: 'available',
        workspaceApplicable: true,
      })),
      getSessionForFile: vi.fn(() => Promise.resolve({
        getDocumentSymbols: vi.fn(() => Promise.resolve({
          cacheStatus: 'hit',
          sessionKey: 'session::typescript',
          sessionStatus: 'ready',
          source: 'cached-lsp',
          value: [{
            kind: LspSymbolKind.Function,
            location: {
              character: 7,
              file: 'example.ts',
              line: 1,
            },
            name: 'runAgentLoop',
            source: 'lsp',
          }],
        })),
      })),
    } as unknown as LspManager;

    const provider = new LspSymbolsProvider(manager);
    const result = await provider.getFileSymbolsDetailed(filePath, {cwd: tempDir, timeout: 250});

    expect(result.source).toBe('cached-lsp');
    expect(result.cacheStatus).toBe('hit');
    expect(result.sessionStatus).toBe('ready');
    expect(result.symbols.map((symbol) => symbol.name)).toEqual(['runAgentLoop']);
  });

  it('falls back when live LSP fails', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-symbols-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export function runAgentLoop() {}\n');

    const manager = {
      getFileStatus: vi.fn(() => Promise.resolve({
        installed: true,
        language: 'TypeScript',
        serverArgs: [mockServerPath, '--invalid-response-method=textDocument/documentSymbol'],
        serverCommand: process.execPath,
        serverName: 'mock-lsp',
        status: 'available',
        workspaceApplicable: true,
      })),
    } as unknown as LspManager;

    const provider = new LspSymbolsProvider(manager);
    const result = await provider.getFileSymbolsDetailed(filePath, {cwd: tempDir, timeout: 250});

    expect(result.source).toBe('fallback-index');
    expect(result.reason).toContain('Live documentSymbol failed');
    expect(result.symbols.map((symbol) => symbol.name)).toContain('runAgentLoop');
    expect(result.symbols.every((symbol) => symbol.source === 'fallback')).toBe(true);
  });

  it('returns an empty list when the file cannot be read', async () => {
    const manager = {
      getFileStatus: vi.fn(() => Promise.resolve({
        installed: true,
        language: 'TypeScript',
        status: 'available',
        workspaceApplicable: true,
      })),
    } as unknown as LspManager;

    const provider = new LspSymbolsProvider(manager);
    const result = await provider.getFileSymbolsDetailed('/does/not/exist.ts', {cwd: process.cwd()});
    const symbols = result.symbols;

    expect(symbols).toEqual([]);
    expect(result.source).toBe('fallback-index');
  });
});