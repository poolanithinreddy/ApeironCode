import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {LspDocumentStore} from '../../src/lsp/documentStore.js';

describe('LspDocumentStore', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (tempDir) => {
      await fs.rm(tempDir, {force: true, recursive: true});
    }));
  });

  it('plans didOpen once and didChange after file content changes', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-doc-store-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export const value = 1;\n');

    const store = new LspDocumentStore();
    const opened = await store.planSync(filePath, 'typescript');
    store.commitSync(opened);

    const unchanged = await store.planSync(filePath, 'typescript');

    await fs.writeFile(filePath, 'export const value = 2;\n');
    const changed = await store.planSync(filePath, 'typescript');

    expect(opened.state).toBe('opened');
    expect(unchanged.state).toBe('unchanged');
    expect(changed.state).toBe('changed');
    expect(changed.record.version).toBe(2);
  });

  it('closes tracked documents', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-doc-store-'));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, 'example.ts');
    await fs.writeFile(filePath, 'export const value = 1;\n');

    const store = new LspDocumentStore();
    const opened = await store.planSync(filePath, 'typescript');
    store.commitSync(opened);

    const closed = store.close(filePath);

    expect(closed?.filePath).toBe(path.resolve(filePath));
    expect(store.size()).toBe(0);
  });
});