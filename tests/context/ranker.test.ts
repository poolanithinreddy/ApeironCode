import {describe, it, expect} from 'vitest';
import {rankFiles} from '../../src/context/ranker.js';

describe('rankFiles - multi-signal file ranking', () => {
  it('returns empty array for empty file list', () => {
    const signals = rankFiles([], 'test prompt', {cwd: '/tmp', prompt: 'test prompt'});
    expect(signals).toEqual([]);
  });

  it('ranks files with name match components', () => {
    const files = ['auth.ts', 'database.ts', 'utils.ts'];
    const signals = rankFiles(files, 'auth database', {cwd: '/tmp', prompt: 'auth database'});

    expect(signals.length).toBe(3);
    expect(signals[0]?.path).toBeTruthy();
    expect(signals[0]?.score).toBeGreaterThanOrEqual(0);
    expect(signals[0]?.components.nameMatch).toBeGreaterThanOrEqual(0);
  });

  it('ranks files higher when multiple signals match', () => {
    const files = ['src/auth/login.ts', 'src/db/users.ts', 'src/utils/helpers.ts'];
    const signals = rankFiles(files, 'auth login', {cwd: '/tmp', prompt: 'auth login'});

    expect(signals.length).toBe(3);
    const authFile = signals.find((s) => s.path === 'src/auth/login.ts');
    const dbFile = signals.find((s) => s.path === 'src/db/users.ts');

    if (authFile && dbFile) {
      expect(authFile.score).toBeGreaterThanOrEqual(dbFile.score);
    }
  });

  it('incorporates import graph signals', () => {
    const files = ['main.ts', 'helper.ts', 'util.ts'];
    const importGraph = new Map<string, Set<string>>([
      ['main.ts', new Set(['helper.ts', 'util.ts'])],
      ['helper.ts', new Set(['util.ts'])],
      ['util.ts', new Set()],
    ]);

    const signals = rankFiles(files, 'main', {
      cwd: '/tmp',
      prompt: 'main',
      importGraph,
      changedFiles: ['util.ts'],
    });

    const mainSignal = signals.find((s) => s.path === 'main.ts');
    expect(mainSignal?.components.importGraph).toBeGreaterThanOrEqual(0);
  });

  it('boosts files with git changes', () => {
    const files = ['changed.ts', 'unchanged.ts'];
    const gitContext = {
      currentBranch: 'main',
      recentFiles: [],
      uncommittedFiles: ['changed.ts'],
      stagedFiles: [],
      recentAuthors: ['alice'],
      recentCommitMessages: ['update feature'],
    };

    const signals = rankFiles(files, 'test', {
      cwd: '/tmp',
      prompt: 'test',
      gitContext,
    });

    const changedSignal = signals.find((s) => s.path === 'changed.ts');
    const unchangedSignal = signals.find((s) => s.path === 'unchanged.ts');

    expect(changedSignal!.score).toBeGreaterThanOrEqual(unchangedSignal!.score);
    expect(changedSignal?.components.gitRecency).toBeGreaterThan(0);
  });

  it('incorporates memory relevance scores', () => {
    const files = ['important.ts', 'other.ts'];
    const memoryFileScores = new Map([
      ['important.ts', 0.9],
      ['other.ts', 0.1],
    ]);

    const signals = rankFiles(files, 'test', {
      cwd: '/tmp',
      prompt: 'test',
      memoryFileScores,
    });

    const importantSignal = signals.find((s) => s.path === 'important.ts');
    const otherSignal = signals.find((s) => s.path === 'other.ts');

    expect(importantSignal!.score).toBeGreaterThan(otherSignal!.score);
    expect(importantSignal?.signals).toContain('memory-relevant');
  });

  it('boosts LSP diagnostics in debug mode', () => {
    const files = ['buggy.ts', 'clean.ts'];
    const lspDiagnostics = new Map([
      ['buggy.ts', 0.8],
      ['clean.ts', 0.1],
    ]);

    const signalsDebug = rankFiles(files, 'debug buggy file', {
      cwd: '/tmp',
      prompt: 'debug buggy file',
      mode: 'debug',
      lspDiagnostics,
    });

    const buggyDebug = signalsDebug.find((s) => s.path === 'buggy.ts');
    expect(buggyDebug?.components.lspDiagnostics).toBeGreaterThan(0.5);

    const signalsDefault = rankFiles(files, 'debug buggy file', {
      cwd: '/tmp',
      prompt: 'debug buggy file',
      lspDiagnostics,
    });

    const buggyDefault = signalsDefault.find((s) => s.path === 'buggy.ts');
    expect(buggyDebug!.components.lspDiagnostics).toBeGreaterThan(buggyDefault!.components.lspDiagnostics);
  });

  it('marks changed files prominently', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const changedFiles = ['src/a.ts'];

    const signals = rankFiles(files, 'test', {
      cwd: '/tmp',
      prompt: 'test',
      changedFiles,
    });

    const changedSignal = signals.find((s) => s.path === 'src/a.ts');
    expect(changedSignal?.components.changedFile).toBeGreaterThan(0.5);
    expect(changedSignal?.signals).toContain('changed-file');
  });

  it('normalizes all component scores to 0-1 range', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const signals = rankFiles(files, 'test', {cwd: '/tmp', prompt: 'test'});

    for (const signal of signals) {
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(1);

      const components = signal.components;
      expect(components.nameMatch).toBeGreaterThanOrEqual(0);
      expect(components.nameMatch).toBeLessThanOrEqual(1);
      expect(components.promptTermMatch).toBeGreaterThanOrEqual(0);
      expect(components.promptTermMatch).toBeLessThanOrEqual(1);
      expect(components.importGraph).toBeGreaterThanOrEqual(0);
      expect(components.importGraph).toBeLessThanOrEqual(1);
      expect(components.gitRecency).toBeGreaterThanOrEqual(0);
      expect(components.gitRecency).toBeLessThanOrEqual(1);
      expect(components.memoryRelevance).toBeGreaterThanOrEqual(0);
      expect(components.memoryRelevance).toBeLessThanOrEqual(1);
      expect(components.lspDiagnostics).toBeGreaterThanOrEqual(0);
      expect(components.lspDiagnostics).toBeLessThanOrEqual(1);
      expect(components.changedFile).toBeGreaterThanOrEqual(0);
      expect(components.changedFile).toBeLessThanOrEqual(1);
    }
  });

  it('sorts results by descending score', () => {
    const files = ['low.ts', 'high.ts', 'medium.ts'];
    const memoryFileScores = new Map([
      ['high.ts', 1.0],
      ['medium.ts', 0.5],
      ['low.ts', 0.1],
    ]);

    const signals = rankFiles(files, 'test', {
      cwd: '/tmp',
      prompt: 'test',
      memoryFileScores,
    });

    expect(signals[0]?.path).toBe('high.ts');
    expect(signals[0]?.score).toBeGreaterThanOrEqual(signals[1]?.score ?? 0);
    expect(signals[1]?.score).toBeGreaterThanOrEqual(signals[2]?.score ?? 0);
  });

  it('provides human-readable signal descriptions', () => {
    const files = ['auth.ts'];
    const signals = rankFiles(files, 'authentication', {cwd: '/tmp', prompt: 'authentication'});

    expect(signals[0]?.signals).toBeDefined();
    expect(Array.isArray(signals[0]?.signals)).toBe(true);

    for (const signal of signals[0]?.signals ?? []) {
      expect(['name-match', 'prompt-term-match', 'import-graph', 'git-recency', 'memory-relevant', 'lsp-diagnostics', 'changed-file']).toContain(signal);
    }
  });

  it('combines multiple signals for final score', () => {
    const files = ['important.ts'];
    const importGraph = new Map<string, Set<string>>([['important.ts', new Set(['helper.ts'])]]);
    const gitContext = {
      currentBranch: 'main',
      recentFiles: [],
      uncommittedFiles: ['important.ts'],
      stagedFiles: [],
      recentAuthors: [],
      recentCommitMessages: [],
    };
    const memoryFileScores = new Map([['important.ts', 0.8]]);
    const lspDiagnostics = new Map([['important.ts', 0.6]]);

    const signals = rankFiles(files, 'important', {
      cwd: '/tmp',
      prompt: 'important',
      importGraph,
      gitContext,
      memoryFileScores,
      lspDiagnostics,
      changedFiles: ['important.ts'],
    });

    const signal = signals[0]!;
    expect(signal.components.gitRecency).toBeGreaterThan(0);
    expect(signal.components.memoryRelevance).toBeGreaterThan(0);
    expect(signal.components.lspDiagnostics).toBeGreaterThan(0);
    expect(signal.score).toBeGreaterThan(0);
  });
});
