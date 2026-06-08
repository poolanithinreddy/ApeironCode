import path from 'node:path';
import {extractSymbolsFromFiles, type SymbolInfo} from './symbols.js';
import type {ImportGraph} from './importGraph.js';

export interface SymbolReference {
  confidence: number;
  fromFile: string;
  reason: string;
  toFile?: string;
  toSymbol: string;
}

export interface SymbolGraph {
  exportsByFile: Map<string, SymbolInfo[]>;
  importsByFile: Map<string, string[]>;
  references: SymbolReference[];
  symbols: SymbolInfo[];
}

export interface BuildSymbolGraphOptions {
  files: string[];
  cwd: string;
  importGraph?: ImportGraph;
  fileContents?: Map<string, string>;
}

const buildExportsByFile = (symbols: SymbolInfo[]): Map<string, SymbolInfo[]> => {
  const out = new Map<string, SymbolInfo[]>();
  for (const sym of symbols) {
    if (!sym.exported) continue;
    const list = out.get(sym.file) ?? [];
    list.push(sym);
    out.set(sym.file, list);
  }
  return out;
};

const buildImportsByFile = (importGraph?: ImportGraph): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  if (!importGraph) return out;
  for (const [file, deps] of importGraph.entries()) {
    out.set(file, [...deps]);
  }
  return out;
};

const symbolNameRegex = (name: string): RegExp => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gu');
};

export const findLikelyReferencedSymbols = (
  fileContent: string,
  symbols: SymbolInfo[],
): SymbolReference[] => {
  const refs: SymbolReference[] = [];
  if (!fileContent || symbols.length === 0) return refs;
  const seen = new Set<string>();
  for (const sym of symbols) {
    if (seen.has(sym.name)) continue;
    if (sym.name.length < 2) continue;
    const re = symbolNameRegex(sym.name);
    const matches = fileContent.match(re);
    if (!matches) continue;
    seen.add(sym.name);
    refs.push({
      confidence: Math.min(1, 0.4 + matches.length * 0.05),
      fromFile: '',
      reason: `text reference (${matches.length}x)`,
      toFile: sym.file,
      toSymbol: sym.name,
    });
  }
  return refs;
};

const readFileSafe = async (cwd: string, file: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  try {
    const stats = await fs.stat(path.join(cwd, file));
    if (!stats.isFile() || stats.size > 200_000) return '';
    return await fs.readFile(path.join(cwd, file), 'utf8');
  } catch {
    return '';
  }
};

export const buildSymbolGraph = async (
  options: BuildSymbolGraphOptions,
): Promise<SymbolGraph> => {
  const symbols = await extractSymbolsFromFiles(options.files, options.cwd);
  const exportsByFile = buildExportsByFile(symbols);
  const importsByFile = buildImportsByFile(options.importGraph);
  const exportedSymbols = symbols.filter((s) => s.exported);

  const references: SymbolReference[] = [];
  await Promise.all(options.files.map(async (file) => {
    const content = options.fileContents?.get(file) ?? await readFileSafe(options.cwd, file);
    if (!content) return;
    const importedFiles = new Set(importsByFile.get(file) ?? []);
    const candidates: SymbolInfo[] = [];
    for (const sym of exportedSymbols) {
      if (sym.file === file) continue;
      const isImported = importedFiles.has(sym.file);
      candidates.push({...sym, exported: isImported || sym.exported});
    }
    const refs = findLikelyReferencedSymbols(content, candidates);
    for (const ref of refs) {
      const isImported = ref.toFile ? importedFiles.has(ref.toFile) : false;
      references.push({
        ...ref,
        confidence: Math.min(1, ref.confidence + (isImported ? 0.4 : 0)),
        fromFile: file,
        reason: isImported ? `${ref.reason} + imported file` : ref.reason,
      });
    }
  }));

  references.sort((a, b) => b.confidence - a.confidence || a.fromFile.localeCompare(b.fromFile));
  return {
    exportsByFile,
    importsByFile,
    references,
    symbols,
  };
};

export const getFilesForSymbols = (query: string, graph: SymbolGraph): string[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = graph.symbols.filter((s) => s.name.toLowerCase().includes(q));
  return Array.from(new Set(matches.map((s) => s.file)));
};

export const getRelatedFilesBySymbol = (
  file: string,
  graph: SymbolGraph,
  depth: number = 1,
): string[] => {
  const related = new Set<string>();
  const queue: Array<{depth: number; file: string}> = [{depth: 0, file}];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next.file) || next.depth > depth) continue;
    visited.add(next.file);

    for (const ref of graph.references) {
      if (ref.fromFile === next.file && ref.toFile && !visited.has(ref.toFile)) {
        related.add(ref.toFile);
        queue.push({depth: next.depth + 1, file: ref.toFile});
      }
      if (ref.toFile === next.file && !visited.has(ref.fromFile)) {
        related.add(ref.fromFile);
        queue.push({depth: next.depth + 1, file: ref.fromFile});
      }
    }
  }
  related.delete(file);
  return [...related].sort();
};
