import {describe, expect, it} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  buildSymbolGraph,
  findLikelyReferencedSymbols,
  getFilesForSymbols,
  getRelatedFilesBySymbol,
} from '../../src/context/symbolGraph.js';
import type {SymbolInfo} from '../../src/context/symbols.js';

const sym = (file: string, name: string, exported = true): SymbolInfo => ({
  exported,
  file,
  kind: 'function',
  line: 1,
  name,
});

describe('findLikelyReferencedSymbols', () => {
  it('matches symbol names by word boundary', () => {
    const refs = findLikelyReferencedSymbols(
      'const result = computeTotal(orders);\n',
      [sym('src/billing.ts', 'computeTotal'), sym('src/other.ts', 'unrelatedFn')],
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]?.toSymbol).toBe('computeTotal');
  });

  it('skips symbols shorter than 2 characters', () => {
    const refs = findLikelyReferencedSymbols('a + b', [sym('a.ts', 'a')]);
    expect(refs).toHaveLength(0);
  });
});

describe('buildSymbolGraph', () => {
  const setup = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oc-graph-'));
    mkdirSync(path.join(dir, 'src'), {recursive: true});
    writeFileSync(path.join(dir, 'src', 'a.ts'), `export function alpha() { return 'a'; }\nexport function beta() { return 'b'; }\n`);
    writeFileSync(path.join(dir, 'src', 'b.ts'), `import {alpha} from './a.js';\nexport function gamma() { return alpha(); }\n`);
    return dir;
  };

  it('builds symbols, exportsByFile, and references', async () => {
    const dir = setup();
    const graph = await buildSymbolGraph({cwd: dir, files: ['src/a.ts', 'src/b.ts']});
    expect(graph.symbols.find((s) => s.name === 'alpha')).toBeTruthy();
    expect(graph.exportsByFile.get('src/a.ts')?.some((s) => s.name === 'alpha')).toBe(true);
    expect(graph.references.some((r) => r.fromFile === 'src/b.ts' && r.toSymbol === 'alpha')).toBe(true);
  });

  it('boosts confidence when symbol file is imported', async () => {
    const dir = setup();
    const importGraph = new Map<string, Set<string>>([
      ['src/b.ts', new Set(['src/a.ts'])],
      ['src/a.ts', new Set()],
    ]);
    const graph = await buildSymbolGraph({cwd: dir, files: ['src/a.ts', 'src/b.ts'], importGraph});
    const ref = graph.references.find((r) => r.fromFile === 'src/b.ts' && r.toSymbol === 'alpha');
    expect(ref).toBeTruthy();
    expect(ref?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(ref?.reason).toContain('imported file');
  });

  it('getFilesForSymbols returns files matching query', async () => {
    const dir = setup();
    const graph = await buildSymbolGraph({cwd: dir, files: ['src/a.ts', 'src/b.ts']});
    expect(getFilesForSymbols('alpha', graph)).toEqual(['src/a.ts']);
    expect(getFilesForSymbols('', graph)).toEqual([]);
  });

  it('getRelatedFilesBySymbol traverses references', async () => {
    const dir = setup();
    const graph = await buildSymbolGraph({cwd: dir, files: ['src/a.ts', 'src/b.ts']});
    const related = getRelatedFilesBySymbol('src/a.ts', graph, 1);
    expect(related).toContain('src/b.ts');
  });
});
