import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';

export interface ContextCacheKey {
  files: Array<{mtimeMs: number; path: string; size: number}>;
  prompt?: string;
  scope: string;
}

export interface ContextCacheEntry<T> {
  computedAt: string;
  fingerprint: string;
  scope: string;
  value: T;
  version: number;
}

export interface ContextCacheOptions {
  cwd: string;
  ttlMs?: number;
  version?: number;
}

const DEFAULT_VERSION = 1;
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

const safeFingerprintEntry = (entry: {path: string; mtimeMs: number; size: number}): string =>
  `${entry.path}|${Math.floor(entry.mtimeMs)}|${entry.size}`;

export const fingerprintFromKey = (key: ContextCacheKey): string => {
  const sorted = [...key.files].sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash('sha1');
  hash.update(key.scope);
  if (key.prompt) {
    hash.update('|');
    hash.update(key.prompt);
  }
  for (const f of sorted) {
    hash.update('\n');
    hash.update(safeFingerprintEntry(f));
  }
  return hash.digest('hex').slice(0, 24);
};

export const buildCacheKeyFromFiles = async (
  cwd: string,
  files: string[],
  scope: string,
  prompt?: string,
): Promise<ContextCacheKey> => {
  const entries: Array<{mtimeMs: number; path: string; size: number}> = [];
  for (const f of files) {
    try {
      const stats = await fs.stat(path.join(cwd, f));
      entries.push({mtimeMs: stats.mtimeMs, path: f, size: stats.size});
    } catch {
      entries.push({mtimeMs: 0, path: f, size: 0});
    }
  }
  return {files: entries, prompt, scope};
};

const cachePath = (cwd: string, scope: string): string =>
  path.join(getProjectConfigDir(cwd), 'context-cache', `${scope}.json`);

export class ContextCache<T> {
  constructor(private readonly options: ContextCacheOptions) {}

  private file(scope: string): string {
    return cachePath(this.options.cwd, scope);
  }

  async get(key: ContextCacheKey): Promise<T | null> {
    try {
      const file = this.file(key.scope);
      const entry = await readJsonFile<ContextCacheEntry<T> | null>(file, null);
      if (!entry) return null;
      if (entry.version !== (this.options.version ?? DEFAULT_VERSION)) return null;
      const fingerprint = fingerprintFromKey(key);
      if (entry.fingerprint !== fingerprint) return null;
      const ttl = this.options.ttlMs ?? DEFAULT_TTL;
      if (Date.now() - new Date(entry.computedAt).getTime() > ttl) return null;
      return entry.value;
    } catch {
      return null;
    }
  }

  async set(key: ContextCacheKey, value: T): Promise<void> {
    const file = this.file(key.scope);
    await ensureDirectory(path.dirname(file));
    const entry: ContextCacheEntry<T> = {
      computedAt: new Date().toISOString(),
      fingerprint: fingerprintFromKey(key),
      scope: key.scope,
      value,
      version: this.options.version ?? DEFAULT_VERSION,
    };
    await writeJsonFile(file, entry);
  }

  async invalidate(scope: string): Promise<void> {
    try {
      await fs.rm(this.file(scope), {force: true});
    } catch {
      // ignore
    }
  }

  async withCache(key: ContextCacheKey, compute: () => Promise<T>): Promise<{cached: boolean; value: T}> {
    const cached = await this.get(key);
    if (cached !== null) return {cached: true, value: cached};
    try {
      const value = await compute();
      await this.set(key, value).catch(() => undefined);
      return {cached: false, value};
    } catch (err) {
      await this.invalidate(key.scope).catch(() => undefined);
      throw err;
    }
  }
}
