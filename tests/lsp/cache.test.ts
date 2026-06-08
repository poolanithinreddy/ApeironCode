import {describe, expect, it} from 'vitest';

import {LspCache} from '../../src/lsp/cache.js';

describe('LspCache', () => {
  it('caches and invalidates entries by file', () => {
    const cache = new LspCache();
    cache.set({
      contentHash: 'hash-1',
      filePath: '/tmp/example.ts',
      method: 'documentSymbol',
      serverId: 'mock-lsp',
    }, ['runAgentLoop']);

    expect(cache.get<string[]>({
      contentHash: 'hash-1',
      filePath: '/tmp/example.ts',
      method: 'documentSymbol',
      serverId: 'mock-lsp',
    })).toEqual(['runAgentLoop']);

    cache.invalidateFile('/tmp/example.ts');

    expect(cache.get<string[]>({
      contentHash: 'hash-1',
      filePath: '/tmp/example.ts',
      method: 'documentSymbol',
      serverId: 'mock-lsp',
    })).toBeNull();
    expect(cache.getSnapshot().invalidations).toBe(1);
  });

  it('clears all cached entries', () => {
    const cache = new LspCache();
    cache.set({
      contentHash: 'hash-1',
      filePath: '/tmp/example.ts',
      method: 'documentSymbol',
      serverId: 'mock-lsp',
    }, ['runAgentLoop']);
    cache.set({
      contentHash: 'hash-2',
      filePath: '/tmp/example.ts',
      method: 'diagnostics',
      serverId: 'mock-lsp',
    }, []);

    cache.clear();

    expect(cache.getSnapshot()).toMatchObject({
      entries: 0,
      invalidations: 2,
      writes: 2,
    });
  });
});