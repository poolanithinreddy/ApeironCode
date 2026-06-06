import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {LspClient} from '../../src/lsp/client.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspClient', () => {
  const clients: LspClient[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(async (client) => {
      await client.dispose().catch(() => undefined);
    }));
    await Promise.all(tempDirs.splice(0).map(async (directory) => {
      await fs.rm(directory, {force: true, recursive: true});
    }));
  });

  const createTempFile = async (): Promise<string> => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-client-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export class MockAgent {}\nexport function runAgentLoop() {}\n');
    return filePath;
  };

  const createClient = (serverArgs: string[] = [], timeout = 250): LspClient => {
    const client = new LspClient({
      cwd: process.cwd(),
      language: 'TypeScript',
      serverArgs: [mockServerPath, ...serverArgs],
      serverCommand: process.execPath,
      timeout,
    });
    clients.push(client);
    return client;
  };

  it('initializes and tracks connection state', async () => {
    const client = createClient();

    await client.initialize();

    expect(client.isConnected()).toBe(true);
    expect(client.isInitialized()).toBe(true);
    expect(client.getCapabilities()).toEqual({documentSymbolProvider: true});
  });

  it('gets live document symbols through didOpen and documentSymbol', async () => {
    const client = createClient();
    const filePath = await createTempFile();

    const symbols = await client.getDocumentSymbols(filePath);

    expect(symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(['MockAgent', 'run', 'runAgentLoop']));
    expect(symbols.every((symbol) => symbol.source === 'lsp')).toBe(true);
  });

  it('shuts down and exits without leaving the process connected', async () => {
    const client = createClient();

    await client.initialize();
    await client.shutdown();
    expect(client.isInitialized()).toBe(false);

    await client.exit();
    expect(client.isConnected()).toBe(false);
  });

  it('cleans up on timeout', async () => {
    const client = createClient(['--delay-ms=200', '--delay-method=textDocument/documentSymbol'], 50);
    const filePath = await createTempFile();

    await expect(client.getDocumentSymbols(filePath)).rejects.toThrow(/Failed to get document symbols/);
    expect(client.isConnected()).toBe(false);
    expect(client.isInitialized()).toBe(false);
  });

  it('handles invalid documentSymbol responses gracefully', async () => {
    const client = createClient(['--invalid-response-method=textDocument/documentSymbol']);
    const filePath = await createTempFile();

    await expect(client.getDocumentSymbols(filePath)).rejects.toThrow(/Invalid documentSymbol response|Failed to get document symbols/);
    expect(client.isConnected()).toBe(false);
  });
});
