import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export class FileCache {
  private readonly statCache = new Map<string, Stats>();
  private readonly textCache = new Map<string, string>();

  constructor(private readonly cwd: string) {}

  absolute(relativePath: string): string {
    return path.join(this.cwd, relativePath);
  }

  async readText(relativePath: string): Promise<string> {
    if (!this.textCache.has(relativePath)) {
      this.textCache.set(relativePath, await fs.readFile(this.absolute(relativePath), 'utf8'));
    }

    return this.textCache.get(relativePath) ?? '';
  }

  async stat(relativePath: string): Promise<Stats> {
    if (!this.statCache.has(relativePath)) {
      this.statCache.set(relativePath, await fs.stat(this.absolute(relativePath)));
    }

    return this.statCache.get(relativePath) as Stats;
  }
}