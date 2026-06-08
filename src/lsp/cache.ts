import path from 'node:path';

import type {LspCacheMethod, LspCacheSnapshot} from './types.js';

interface LspCacheEntry<T> {
  method: LspCacheMethod;
  filePath: string;
  contentHash: string;
  serverId: string;
  extraKey?: string;
  value: T;
  updatedAt: string;
}

export interface LspCacheLookupInput {
  method: LspCacheMethod;
  filePath: string;
  contentHash: string;
  serverId: string;
  extraKey?: string;
}

export class LspCache {
  private readonly entries = new Map<string, LspCacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private invalidations = 0;

  get<T>(input: LspCacheLookupInput): T | null {
    const entry = this.entries.get(this.toKey(input));
    if (!entry) {
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    return entry.value as T;
  }

  set<T>(input: LspCacheLookupInput, value: T): void {
    this.entries.set(this.toKey(input), {
      ...input,
      filePath: path.resolve(input.filePath),
      updatedAt: new Date().toISOString(),
      value,
    });
    this.writes += 1;
  }

  invalidateFile(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    let removed = 0;

    for (const [key, entry] of this.entries) {
      if (entry.filePath !== resolvedPath) {
        continue;
      }

      this.entries.delete(key);
      removed += 1;
    }

    if (removed > 0) {
      this.invalidations += removed;
    }
  }

  clear(): void {
    this.invalidations += this.entries.size;
    this.entries.clear();
  }

  getSnapshot(): LspCacheSnapshot {
    const byMethod: Partial<Record<LspCacheMethod, number>> = {};
    for (const entry of this.entries.values()) {
      byMethod[entry.method] = (byMethod[entry.method] ?? 0) + 1;
    }

    return {
      byMethod,
      entries: this.entries.size,
      hits: this.hits,
      invalidations: this.invalidations,
      misses: this.misses,
      writes: this.writes,
    };
  }

  private toKey(input: LspCacheLookupInput): string {
    return [
      input.serverId,
      input.method,
      path.resolve(input.filePath),
      input.contentHash,
      input.extraKey ?? '',
    ].join('::');
  }
}