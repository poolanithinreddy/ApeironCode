import {describe, expect, it} from 'vitest';
import {explainRankSignal, rankFilesV2} from '../../src/context/ranker.js';
import type {ContextPlan} from '../../src/context/contextPlan.js';
import type {SymbolGraph} from '../../src/context/symbolGraph.js';

const baseFiles = ['src/foo.ts', 'src/bar.ts', 'src/baz.ts', 'tests/foo.test.ts'];

describe('rankFilesV2', () => {
  it('returns deterministic ordering with score explanations', () => {
    const result = rankFilesV2(baseFiles, 'work on src/foo.ts', {
      cwd: '.',
      prompt: 'work on src/foo.ts',
    });
    expect(result.length).toBe(baseFiles.length);
    expect(result[0]?.path).toBe('src/foo.ts');
    const result2 = rankFilesV2(baseFiles, 'work on src/foo.ts', {cwd: '.', prompt: 'work on src/foo.ts'});
    expect(result.map((s) => s.path)).toEqual(result2.map((s) => s.path));
  });

  it('boosts files in context plan fullFiles', () => {
    const plan: ContextPlan = {
      excludedFiles: [],
      explanation: '',
      fullFiles: ['src/baz.ts'],
      relatedFiles: [],
      summaryFiles: [],
      taskType: 'feature',
      testFiles: [],
      tokenBudget: 5000,
      toolsLikelyNeeded: [],
    };
    const result = rankFilesV2(baseFiles, 'do something', {cwd: '.', prompt: 'do something', contextPlan: plan});
    expect(result[0]?.path).toBe('src/baz.ts');
    expect(result[0]?.signals).toContain('plan-full');
  });

  it('boosts files with failure signals', () => {
    const failureFileScores = new Map([['src/bar.ts', 1.5]]);
    const result = rankFilesV2(baseFiles, 'fix it', {cwd: '.', prompt: 'fix it', failureFileScores});
    expect(result[0]?.path).toBe('src/bar.ts');
    expect(result[0]?.signals).toContain('failure-signal');
  });

  it('uses symbol graph and symbol name matches', () => {
    const graph: SymbolGraph = {
      exportsByFile: new Map(),
      importsByFile: new Map(),
      references: [
        {confidence: 0.9, fromFile: 'src/foo.ts', reason: 'import', toFile: 'src/bar.ts', toSymbol: 'X'},
      ],
      symbols: [],
    };
    const result = rankFilesV2(baseFiles, 'do', {
      cwd: '.',
      prompt: 'do',
      symbolGraph: graph,
      symbolQueryMatches: new Set(['src/baz.ts']),
    });
    const baz = result.find((r) => r.path === 'src/baz.ts');
    expect(baz?.signals).toContain('symbol-name-match');
  });

  it('respects mode-specific weights', () => {
    const failureFileScores = new Map([['src/foo.ts', 1.0]]);
    const debug = rankFilesV2(baseFiles, 'do', {cwd: '.', prompt: 'do', failureFileScores, mode: 'debug'});
    const review = rankFilesV2(baseFiles, 'do', {cwd: '.', prompt: 'do', failureFileScores, mode: 'review'});
    const debugFoo = debug.find((r) => r.path === 'src/foo.ts')?.score ?? 0;
    const reviewFoo = review.find((r) => r.path === 'src/foo.ts')?.score ?? 0;
    expect(debugFoo).toBeGreaterThan(reviewFoo);
  });

  it('explainRankSignal renders all positive components', () => {
    const result = rankFilesV2(['src/foo.ts'], 'work on src/foo.ts', {cwd: '.', prompt: 'work on src/foo.ts'});
    const text = explainRankSignal(result[0]!);
    expect(text).toContain('src/foo.ts');
    expect(text).toContain('score=');
    expect(text).toMatch(/promptTermMatch|nameMatch/);
  });
});
