import path from 'node:path';

import {FileCache} from './fileCache.js';
import {listProjectFiles} from './ignore.js';
import {classifyFileKind, extractSymbolHints, inferLanguageFromPath} from './symbols.js';

export interface ProjectIndexEntry {
  exports: string[];
  extension: string;
  imports: string[];
  kind: 'config' | 'doc' | 'generated' | 'source' | 'test';
  language: string;
  modifiedTimeMs: number;
  path: string;
  preview: string;
  size: number;
  symbols: string[];
}

export const buildProjectIndex = async (
  cwd: string,
  ignorePatterns: string[],
): Promise<ProjectIndexEntry[]> => {
  const cache = new FileCache(cwd);
  const entries = await listProjectFiles(cwd, ignorePatterns);

  return Promise.all(
    entries.map(async (relativePath) => {
      const stats = await cache.stat(relativePath);
      const extension = path.extname(relativePath).toLowerCase();
      let preview = '';
      let imports: string[] = [];
      let exports: string[] = [];
      let symbols: string[] = [];

      const isTextCandidate = stats.size <= 200_000 && !['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'].includes(extension);
      if (isTextCandidate) {
        const text = await cache.readText(relativePath);
        preview = text.slice(0, 2_000);
        const hints = extractSymbolHints(text, relativePath);
        imports = hints.imports;
        exports = hints.exports;
        symbols = hints.symbols;
      }

      return {
        exports,
        extension,
        imports,
        kind: classifyFileKind(relativePath),
        language: inferLanguageFromPath(relativePath),
        modifiedTimeMs: stats.mtimeMs,
        path: relativePath,
        preview,
        size: stats.size,
        symbols,
      };
    }),
  );
};