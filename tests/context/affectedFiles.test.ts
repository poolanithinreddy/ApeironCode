import {describe, expect, it} from 'vitest';
import {explainAffectedFiles, findAffectedFiles, rankAffectedTests} from '../../src/context/affectedFiles.js';
import type {ImportGraph} from '../../src/context/importGraph.js';
import type {SymbolGraph} from '../../src/context/symbolGraph.js';
import type {TestSourceMap} from '../../src/context/testMapper.js';

const buildGraph = (entries: Array<[string, string[]]>): ImportGraph => {
  const g: ImportGraph = new Map();
  for (const [file, deps] of entries) g.set(file, new Set(deps));
  return g;
};

const buildTestMap = (pairs: Array<[string, string[]]>): TestSourceMap => ({
  sourceForTest: new Map(),
  testsForSource: new Map(pairs),
  unmatchedTests: [],
});

const symbolGraph = (refs: Array<{from: string; to: string}>): SymbolGraph => ({
  exportsByFile: new Map(),
  importsByFile: new Map(),
  references: refs.map((r) => ({confidence: 0.6, fromFile: r.from, reason: 'test', toFile: r.to, toSymbol: 'X'})),
  symbols: [],
});

describe('findAffectedFiles', () => {
  it('returns empty when no changed files', () => {
    const result = findAffectedFiles([]);
    expect(result.directFiles).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('uses import graph dependents', () => {
    const graph = buildGraph([
      ['src/a.ts', []],
      ['src/b.ts', ['src/a.ts']],
    ]);
    const result = findAffectedFiles(['src/a.ts'], {importGraph: graph});
    expect(result.dependentFiles).toContain('src/b.ts');
  });

  it('includes test files via testSourceMap', () => {
    const result = findAffectedFiles(['src/foo.ts'], {
      testSourceMap: buildTestMap([['src/foo.ts', ['tests/foo.test.ts']]]),
    });
    expect(result.testFiles).toContain('tests/foo.test.ts');
  });

  it('includes symbol graph references', () => {
    const result = findAffectedFiles(['src/foo.ts'], {
      symbolGraph: symbolGraph([{from: 'src/bar.ts', to: 'src/foo.ts'}]),
    });
    expect(result.dependentFiles).toContain('src/bar.ts');
  });

  it('flags package boundaries and configs', () => {
    const result = findAffectedFiles(['packages/web/src/index.ts', 'package.json'], {
      configFiles: ['package.json', 'tsconfig.json'],
      packageBoundaries: ['packages/web', 'packages/api'],
    });
    expect(result.configFiles).toContain('package.json');
    expect(result.reasons.some((r) => r.includes('package boundary'))).toBe(true);
  });
});

describe('rankAffectedTests', () => {
  it('orders tests by mapping then graph', () => {
    const graph = buildGraph([
      ['tests/transitive.test.ts', ['src/foo.ts']],
    ]);
    const result = rankAffectedTests(['src/foo.ts'], {
      importGraph: graph,
      testSourceMap: buildTestMap([['src/foo.ts', ['tests/foo.test.ts']]]),
    });
    expect(result[0]).toBe('tests/foo.test.ts');
    expect(result).toContain('tests/transitive.test.ts');
  });
});

describe('explainAffectedFiles', () => {
  it('renders a deterministic summary', () => {
    const text = explainAffectedFiles({
      confidence: 0.8,
      configFiles: ['package.json'],
      dependentFiles: ['src/b.ts'],
      directFiles: ['src/a.ts'],
      reasons: ['hello'],
      testFiles: ['tests/a.test.ts'],
    });
    expect(text).toContain('confidence 0.80');
    expect(text).toContain('src/a.ts');
    expect(text).toContain('hello');
  });
});
