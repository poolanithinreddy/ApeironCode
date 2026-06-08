import {describe, it, expect} from 'vitest';
import {
  groupDiagnosticsByFile,
  calculateFileDiagnosticsSignal,
  buildLspDiagnosticsScores,
  buildLspSignalsMap,
  formatLspDiagnosticsSignals,
  type FileDiagnosticsSignal,
} from '../../src/context/lspSignals.js';
import type {LspDiagnostic} from '../../src/lsp/types.js';

describe('lspSignals - extract relevance from LSP diagnostics', () => {
  it('groups diagnostics by file', () => {
    const diagnostics: LspDiagnostic[] = [
      {
        character: 0,
        file: 'src/a.ts',
        line: 1,
        message: 'error',
        severity: 'error',
        source: 'lsp',
      },
      {
        character: 0,
        file: 'src/b.ts',
        line: 1,
        message: 'warning',
        severity: 'warning',
        source: 'lsp',
      },
      {
        character: 0,
        file: 'src/a.ts',
        line: 5,
        message: 'another error',
        severity: 'error',
        source: 'lsp',
      },
    ];

    const grouped = groupDiagnosticsByFile(diagnostics);
    expect(grouped.size).toBe(2);
    expect(grouped.get('src/a.ts')?.length).toBe(2);
    expect(grouped.get('src/b.ts')?.length).toBe(1);
  });

  it('calculates file diagnostics signal', () => {
    const diagnostics: LspDiagnostic[] = [
      {
        character: 0,
        file: 'src/test.ts',
        line: 1,
        message: 'error 1',
        severity: 'error',
        source: 'lsp',
      },
      {
        character: 0,
        file: 'src/test.ts',
        line: 2,
        message: 'warning 1',
        severity: 'warning',
        source: 'lsp',
      },
    ];

    const signal = calculateFileDiagnosticsSignal('src/test.ts', diagnostics);
    expect(signal.filePath).toBe('src/test.ts');
    expect(signal.diagnosticCount).toBe(2);
    expect(signal.errorCount).toBe(1);
    expect(signal.warningCount).toBe(1);
    expect(signal.hintCount).toBe(0);
    expect(signal.score).toBeGreaterThan(0);
  });

  it('weights errors more heavily than warnings', () => {
    const errorDiags: LspDiagnostic[] = [
      {character: 0, file: 'a.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
    ];
    const warningDiags: LspDiagnostic[] = [
      {character: 0, file: 'b.ts', line: 1, message: 'warning', severity: 'warning', source: 'lsp'},
    ];

    const errorSignal = calculateFileDiagnosticsSignal('a.ts', errorDiags);
    const warningSignal = calculateFileDiagnosticsSignal('b.ts', warningDiags);

    expect(errorSignal.score).toBeGreaterThan(warningSignal.score);
  });

  it('weights warnings more heavily than hints', () => {
    const warningDiags: LspDiagnostic[] = [
      {character: 0, file: 'a.ts', line: 1, message: 'warning', severity: 'warning', source: 'lsp'},
    ];
    const hintDiags: LspDiagnostic[] = [
      {character: 0, file: 'b.ts', line: 1, message: 'hint', severity: 'hint', source: 'lsp'},
    ];

    const warningSignal = calculateFileDiagnosticsSignal('a.ts', warningDiags);
    const hintSignal = calculateFileDiagnosticsSignal('b.ts', hintDiags);

    expect(warningSignal.score).toBeGreaterThan(hintSignal.score);
  });

  it('boosts live LSP diagnostics', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/test.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
    ];

    const signal = calculateFileDiagnosticsSignal('src/test.ts', diagnostics);
    expect(signal.source).toBe('lsp');
    expect(signal.score).toBeGreaterThan(0);
  });

  it('handles fallback diagnostics', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/test.ts', line: 1, message: 'error', severity: 'error', source: 'fallback'},
    ];

    const signal = calculateFileDiagnosticsSignal('src/test.ts', diagnostics);
    expect(signal.source).toBe('fallback');
  });

  it('normalizes scores to 0-1 range', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'a.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
      {character: 0, file: 'a.ts', line: 2, message: 'error', severity: 'error', source: 'lsp'},
      {character: 0, file: 'a.ts', line: 3, message: 'error', severity: 'error', source: 'lsp'},
    ];

    const signal = calculateFileDiagnosticsSignal('a.ts', diagnostics);
    expect(signal.score).toBeGreaterThanOrEqual(0);
    expect(signal.score).toBeLessThanOrEqual(1);
  });

  it('builds scores map from diagnostics', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/a.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
      {character: 0, file: 'src/b.ts', line: 1, message: 'warning', severity: 'warning', source: 'lsp'},
    ];

    const scores = buildLspDiagnosticsScores(diagnostics);
    expect(scores.size).toBe(2);
    expect(scores.has('src/a.ts')).toBe(true);
    expect(scores.has('src/b.ts')).toBe(true);

    const scoreA = scores.get('src/a.ts')!;
    const scoreB = scores.get('src/b.ts')!;
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('builds signals map from diagnostics', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/test.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
    ];

    const signals = buildLspSignalsMap(diagnostics);
    expect(signals.has('src/test.ts')).toBe(true);

    const signal = signals.get('src/test.ts')!;
    expect(signal.filePath).toBe('src/test.ts');
    expect(signal.errorCount).toBe(1);
  });

  it('formats signals for display', () => {
    const signals = new Map<string, FileDiagnosticsSignal>([
      [
        'src/buggy.ts',
        {
          diagnosticCount: 3,
          errorCount: 2,
          filePath: 'src/buggy.ts',
          hintCount: 0,
          score: 0.8,
          source: 'lsp',
          warningCount: 1,
        },
      ],
    ]);

    const formatted = formatLspDiagnosticsSignals(signals);
    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('src/buggy.ts');
    expect(formatted).toContain('2 errors');
    expect(formatted).toContain('1 warnings');
  });

  it('handles empty diagnostics in formatting', () => {
    const signals = new Map<string, FileDiagnosticsSignal>();
    const formatted = formatLspDiagnosticsSignals(signals);

    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('No LSP diagnostic signals');
  });

  it('counts all severity levels correctly', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/all.ts', line: 1, message: 'error', severity: 'error', source: 'lsp'},
      {character: 0, file: 'src/all.ts', line: 2, message: 'warning', severity: 'warning', source: 'lsp'},
      {character: 0, file: 'src/all.ts', line: 3, message: 'info', severity: 'information', source: 'lsp'},
      {character: 0, file: 'src/all.ts', line: 4, message: 'hint', severity: 'hint', source: 'lsp'},
    ];

    const signal = calculateFileDiagnosticsSignal('src/all.ts', diagnostics);
    expect(signal.errorCount).toBe(1);
    expect(signal.warningCount).toBe(1);
    expect(signal.hintCount).toBe(2);
    expect(signal.diagnosticCount).toBe(4);
  });

  it('returns empty scores for no diagnostics', () => {
    const scores = buildLspDiagnosticsScores([]);
    expect(scores.size).toBe(0);
  });

  it('handles multiple diagnostics per file', () => {
    const diagnostics: LspDiagnostic[] = [
      {character: 0, file: 'src/a.ts', line: 1, message: 'error 1', severity: 'error', source: 'lsp'},
      {character: 0, file: 'src/a.ts', line: 2, message: 'error 2', severity: 'error', source: 'lsp'},
      {character: 0, file: 'src/a.ts', line: 3, message: 'error 3', severity: 'error', source: 'lsp'},
      {character: 0, file: 'src/a.ts', line: 4, message: 'error 4', severity: 'error', source: 'lsp'},
    ];

    const signal = calculateFileDiagnosticsSignal('src/a.ts', diagnostics);
    expect(signal.diagnosticCount).toBe(4);
    expect(signal.errorCount).toBe(4);
  });
});
