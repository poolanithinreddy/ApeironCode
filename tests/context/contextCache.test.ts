import {describe, expect, it} from 'vitest';
import {mkdtempSync, writeFileSync, mkdirSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ContextCache, buildCacheKeyFromFiles, fingerprintFromKey} from '../../src/context/contextCache.js';

const setupRepo = (): {cwd: string; files: string[]} => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oc-cache-'));
  mkdirSync(path.join(dir, 'src'), {recursive: true});
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(dir, 'src', 'b.ts'), 'export const b = 2;\n');
  return {cwd: dir, files: ['src/a.ts', 'src/b.ts']};
};

describe('ContextCache', () => {
  it('hits the cache on identical fingerprints', async () => {
    const {cwd, files} = setupRepo();
    const cache = new ContextCache<number>({cwd});
    const key = await buildCacheKeyFromFiles(cwd, files, 'symbols');
    let computed = 0;
    const r1 = await cache.withCache(key, () => Promise.resolve(++computed));
    const r2 = await cache.withCache(key, () => Promise.resolve(++computed));
    expect(r1.cached).toBe(false);
    expect(r2.cached).toBe(true);
    expect(r1.value).toBe(r2.value);
  });

  it('invalidates when a file changes (mtime/size)', async () => {
    const {cwd, files} = setupRepo();
    const cache = new ContextCache<string>({cwd});
    const key1 = await buildCacheKeyFromFiles(cwd, files, 'sym');
    let calls = 0;
    await cache.withCache(key1, () => Promise.resolve(`v${++calls}`));
    const filePath = path.join(cwd, 'src', 'a.ts');
    writeFileSync(filePath, 'export const a = 1;\nexport const c = 3;\n');
    const future = new Date(Date.now() + 5_000);
    utimesSync(filePath, future, future);
    const key2 = await buildCacheKeyFromFiles(cwd, files, 'sym');
    expect(fingerprintFromKey(key1)).not.toBe(fingerprintFromKey(key2));
    const r2 = await cache.withCache(key2, () => Promise.resolve(`v${++calls}`));
    expect(r2.cached).toBe(false);
    expect(r2.value).toBe('v2');
  });

  it('rebuilds when cache file is corrupt', async () => {
    const {cwd, files} = setupRepo();
    const cache = new ContextCache<number>({cwd});
    const key = await buildCacheKeyFromFiles(cwd, files, 'corrupt');
    await cache.withCache(key, () => Promise.resolve(7));
    const cachePath = path.join(cwd, '.apeironcode-agent', 'context-cache', 'corrupt.json');
    writeFileSync(cachePath, '{ not valid json');
    const r = await cache.withCache(key, () => Promise.resolve(99));
    expect(r.cached).toBe(false);
    expect(r.value).toBe(99);
  });

  it('returns stable fingerprint for same inputs in different order', async () => {
    const {cwd, files} = setupRepo();
    const k1 = await buildCacheKeyFromFiles(cwd, [...files].reverse(), 'a');
    const k2 = await buildCacheKeyFromFiles(cwd, [...files], 'a');
    expect(fingerprintFromKey(k1)).toBe(fingerprintFromKey(k2));
  });

  it('invalidate() removes cached entry', async () => {
    const {cwd, files} = setupRepo();
    const cache = new ContextCache<number>({cwd});
    const key = await buildCacheKeyFromFiles(cwd, files, 'inv');
    await cache.withCache(key, () => Promise.resolve(1));
    await cache.invalidate('inv');
    const r = await cache.withCache(key, () => Promise.resolve(2));
    expect(r.cached).toBe(false);
    expect(r.value).toBe(2);
  });
});
