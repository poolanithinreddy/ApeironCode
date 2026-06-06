import type {LspDiagnostic} from '../lsp/types.js';

export interface FileDiagnosticsSignal {
  filePath: string;
  diagnosticCount: number;
  errorCount: number;
  warningCount: number;
  hintCount: number;
  score: number;
  source: 'lsp' | 'fallback';
}

const severityWeights: Record<string, number> = {
  error: 1.0,
  warning: 0.6,
  information: 0.3,
  hint: 0.2,
};

export const groupDiagnosticsByFile = (diagnostics: LspDiagnostic[]): Map<string, LspDiagnostic[]> => {
  const grouped = new Map<string, LspDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const existing = grouped.get(diagnostic.file) ?? [];
    grouped.set(diagnostic.file, [...existing, diagnostic]);
  }

  return grouped;
};

export const calculateFileDiagnosticsSignal = (
  filePath: string,
  diagnostics: LspDiagnostic[],
): FileDiagnosticsSignal => {
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const hintCount = diagnostics.filter((d) => d.severity === 'information' || d.severity === 'hint').length;

  let score = 0;
  for (const diagnostic of diagnostics) {
    score += severityWeights[diagnostic.severity] ?? 0;
  }

  const isFromLsp = diagnostics.some((d) => d.source === 'lsp');

  return {
    filePath,
    diagnosticCount: diagnostics.length,
    errorCount,
    warningCount,
    hintCount,
    score: normalizeSignalScore(score, diagnostics.length, isFromLsp),
    source: isFromLsp ? 'lsp' : 'fallback',
  };
};

const normalizeSignalScore = (weightedScore: number, count: number, isLive: boolean): number => {
  let normalized = Math.min(1, weightedScore / Math.max(1, count * 2));

  if (isLive) {
    normalized *= 1.2;
  }

  return Math.min(1, normalized);
};

export const buildLspDiagnosticsScores = (diagnostics: LspDiagnostic[]): Map<string, number> => {
  const grouped = groupDiagnosticsByFile(diagnostics);
  const scores = new Map<string, number>();

  for (const [filePath, fileDiagnostics] of grouped) {
    const signal = calculateFileDiagnosticsSignal(filePath, fileDiagnostics);
    scores.set(filePath, signal.score);
  }

  return scores;
};

export const buildLspSignalsMap = (diagnostics: LspDiagnostic[]): Map<string, FileDiagnosticsSignal> => {
  const grouped = groupDiagnosticsByFile(diagnostics);
  const signals = new Map<string, FileDiagnosticsSignal>();

  for (const [filePath, fileDiagnostics] of grouped) {
    const signal = calculateFileDiagnosticsSignal(filePath, fileDiagnostics);
    signals.set(filePath, signal);
  }

  return signals;
};

export const formatLspDiagnosticsSignals = (signals: Map<string, FileDiagnosticsSignal>): string => {
  if (signals.size === 0) {
    return 'No LSP diagnostic signals available.';
  }

  return Array.from(signals.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(
      (signal) =>
        `- ${signal.filePath} (score=${signal.score.toFixed(2)}) — ${signal.errorCount} errors, ${signal.warningCount} warnings [${signal.source}]`,
    )
    .join('\n');
};
