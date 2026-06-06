import type {
  LspCacheSnapshot,
  LspDetectionResult,
  LspDiagnostic,
  LspSessionSnapshot,
  LspSymbol,
  LspSymbolQueryResult,
  LspDiagnosticsResult,
  LspDefinitionResult,
  LspReferencesResult,
} from './types.js';

export const formatLspStatus = (result: LspDetectionResult): string => {
  switch (result.status) {
    case 'available':
      return `✓ ${result.language}: ${result.serverName}${result.version ? ` v${result.version}` : ''}`;
    case 'missing':
      return `✗ ${result.language}: missing (${result.installHint})`;
    case 'unsupported':
      return `- ${result.language}: unsupported`;
    case 'disabled':
      return `⊘ ${result.language}: disabled`;
    case 'fallback':
      return `~ ${result.language}: fallback mode`;
    default:
      return `? ${result.language}: unknown`;
  }
};

export const formatDiagnostics = (diagnostics: LspDiagnostic[]): string => {
  if (diagnostics.length === 0) {
    return 'No diagnostics';
  }

  const grouped = diagnostics.reduce(
    (acc, diag) => {
      if (!acc[diag.severity]) {
        acc[diag.severity] = [];
      }
      acc[diag.severity]!.push(diag);
      return acc;
    },
    {} as Record<string, LspDiagnostic[] | undefined>,
  );

  const lines: string[] = [];

  for (const severity of ['error', 'warning', 'information', 'hint'] as const) {
    const diags = grouped[severity];
    if (!diags) continue;

    lines.push(`${severity.toUpperCase()} (${diags.length}):`);
    for (const diag of diags.slice(0, 5)) {
      lines.push(
        `  ${diag.file}:${diag.line}:${diag.character} - ${diag.message}`,
      );
    }
    if (diags.length > 5) {
      lines.push(`  ... and ${diags.length - 5} more`);
    }
  }

  return lines.join('\n');
};

export const formatSymbols = (symbols: LspSymbol[]): string => {
  if (symbols.length === 0) {
    return 'No symbols found';
  }

  const lines = symbols.slice(0, 20).map((sym) => {
    const location = `${sym.location.file}:${sym.location.line}:${sym.location.character}`;
    return `  ${sym.name} (${sym.kind}) - ${location}`;
  });

  if (symbols.length > 20) {
    lines.push(`  ... and ${symbols.length - 20} more`);
  }

  return lines.join('\n');
};

const getSymbolSourceLabel = (source: LspSymbolQueryResult['source']): string => {
  switch (source) {
    case 'live-lsp':
      return 'live LSP';
    case 'cached-lsp':
      return 'cached LSP';
    default:
      return 'fallback index';
  }
};

const summarizeReason = (reason?: string, maxLength = 160): string | null => {
  if (!reason) {
    return null;
  }

  const normalized = reason.replace(/\s+/gu, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
};

export const formatSymbolQueryResult = (result: LspSymbolQueryResult): string => {
  return [
    formatLspStatus(result.status),
    `source: ${getSymbolSourceLabel(result.source)}`,
    result.sessionStatus ? `session: ${result.sessionStatus}${result.cacheStatus ? ` (${result.cacheStatus})` : ''}` : null,
    result.reason ? `reason: ${result.reason}` : null,
    formatSymbols(result.symbols),
  ].filter(Boolean).join('\n');
};

export const formatSymbolContextForPrompt = (results: LspSymbolQueryResult[]): string => {
  if (results.length === 0) {
    return '';
  }

  return [
    'Document symbols for relevant files:',
    ...results.flatMap((result) => [
      `- ${result.file} | source: ${getSymbolSourceLabel(result.source)}${result.reason ? ` | reason: ${summarizeReason(result.reason)}` : ''}`,
      `  Symbols: ${result.symbols.slice(0, 6).map((symbol) => symbol.name).join(', ') || 'none found'}`,
    ]),
  ].join('\n');
};

export const formatSymbolContextForSummary = (results: LspSymbolQueryResult[]): string => {
  if (results.length === 0) {
    return '';
  }

  return `Document symbols: ${results
    .map((result) => `${result.file} via ${getSymbolSourceLabel(result.source)}${result.reason ? ` (${summarizeReason(result.reason, 90)})` : ''}`)
    .join('; ')}`;
};

const getDiagnosticsSourceLabel = (source: LspDiagnosticsResult['source']): string => {
  switch (source) {
    case 'live-lsp':
      return 'live LSP';
    case 'cached-lsp':
      return 'cached LSP';
    default:
      return 'fallback analysis';
  }
};

const getDiagnosticsAggregateSourceLabel = (results: LspDiagnosticsResult[]): string => {
  const sources = Array.from(new Set(results.map((result) => result.source)));
  if (sources.length === 0) {
    return 'unknown';
  }

  if (sources.length === 1) {
    return getDiagnosticsSourceLabel(sources[0]!);
  }

  return `mixed (${sources.map((source) => getDiagnosticsSourceLabel(source)).join(' + ')})`;
};

const collectDiagnosticsReasons = (results: LspDiagnosticsResult[], maxReasons = 2): string[] => {
  return Array.from(
    new Set(
      results
        .map((result) => summarizeReason(result.reason, 120))
        .filter((reason): reason is string => Boolean(reason)),
    ),
  ).slice(0, maxReasons);
};

const formatCompactDiagnostic = (diagnostic: LspDiagnostic): string => {
  const code = diagnostic.code ? ` ${String(diagnostic.code)}` : '';
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.character} ${diagnostic.severity}${code} ${diagnostic.message}`;
};

export const formatDiagnosticsResult = (result: LspDiagnosticsResult): string => {
  const lines: string[] = [
    `Diagnostics for ${result.filePath}`,
    `source: ${getDiagnosticsSourceLabel(result.source)}`,
  ];

  if (result.source === 'live-lsp' && result.server) {
    lines.push(`server: ${result.server}`);
  }

  if (result.sessionStatus) {
    lines.push(`session: ${result.sessionStatus}${result.cacheStatus ? ` (${result.cacheStatus})` : ''}`);
  }

  if (result.reason) {
    lines.push(`reason: ${result.reason}`);
  }

  if (result.diagnostics.length === 0) {
    lines.push(result.source === 'live-lsp' ? 'No diagnostics reported.' : 'No live diagnostics available.');
    return lines.join('\n');
  }

  const grouped = result.diagnostics.reduce(
    (acc, diag) => {
      if (!acc[diag.severity]) {
        acc[diag.severity] = [];
      }
      acc[diag.severity]!.push(diag);
      return acc;
    },
    {} as Record<string, LspDiagnostic[] | undefined>,
  );

  const outputLines: string[] = [];
  for (const severity of ['error', 'warning', 'information', 'hint'] as const) {
    const diags = grouped[severity];
    if (!diags) continue;

    outputLines.push(`${severity.toUpperCase()} (${diags.length}):`);
    for (const diag of diags.slice(0, 5)) {
      outputLines.push(
        `  ${diag.file}:${diag.line}:${diag.character} - ${diag.message}`,
      );
    }
    if (diags.length > 5) {
      outputLines.push(`  ... and ${diags.length - 5} more`);
    }
  }

  return [...lines, ...outputLines].join('\n');
};

export const formatDefinitionResult = (result: LspDefinitionResult): string => {
  const sourceLabel = result.source === 'live-lsp'
    ? 'live LSP'
    : result.source === 'cached-lsp'
      ? 'cached LSP'
      : 'fallback unavailable';
  const lines: string[] = [
    `Definition for ${result.filePath}`,
    `source: ${sourceLabel}`,
  ];

  if (result.sessionStatus) {
    lines.push(`session: ${result.sessionStatus}${result.cacheStatus ? ` (${result.cacheStatus})` : ''}`);
  }

  if (result.reason) {
    lines.push(`reason: ${result.reason}`);
  }

  if (result.definitions.length === 0) {
    lines.push('No definition found.');
    return lines.join('\n');
  }

  for (const def of result.definitions) {
    lines.push(`  ${def.file}:${def.line}:${def.character}`);
  }

  return lines.join('\n');
};

export const formatReferencesResult = (result: LspReferencesResult): string => {
  const sourceLabel = result.source === 'live-lsp'
    ? 'live LSP'
    : result.source === 'cached-lsp'
      ? 'cached LSP'
      : 'fallback unavailable';
  const lines: string[] = [
    `References for ${result.filePath}`,
    `source: ${sourceLabel}`,
  ];

  if (result.sessionStatus) {
    lines.push(`session: ${result.sessionStatus}${result.cacheStatus ? ` (${result.cacheStatus})` : ''}`);
  }

  if (result.reason) {
    lines.push(`reason: ${result.reason}`);
  }

  if (result.references.length === 0) {
    lines.push('No references found.');
    return lines.join('\n');
  }

  for (const ref of result.references.slice(0, 10)) {
    lines.push(`  ${ref.file}:${ref.line}:${ref.character}`);
  }

  if (result.references.length > 10) {
    lines.push(`  ... and ${result.references.length - 10} more`);
  }

  return lines.join('\n');
};

export const formatDiagnosticsContextForPrompt = (results: LspDiagnosticsResult[]): string => {
  if (results.length === 0) {
    return '';
  }

  const allDiags = results.flatMap((r) => r.diagnostics);
  const cappedDiags = allDiags.slice(0, 10);
  const reasons = collectDiagnosticsReasons(results);
  const lines = [
    'Diagnostics:',
    `- Diagnostics source: ${getDiagnosticsAggregateSourceLabel(results)}`,
    `- Files checked: ${results.length}`,
    `- Diagnostics found: ${allDiags.length}`,
  ];

  if (reasons.length > 0) {
    lines.push(`- Reason: ${reasons.join('; ')}`);
  }

  if (allDiags.length === 0) {
    lines.push(`- ${results.some((result) => result.source === 'fallback-analysis') ? 'No live diagnostics available' : 'No diagnostics reported'}`);
    return lines.join('\n');
  }

  lines.push(...cappedDiags.map((diagnostic) => `- ${formatCompactDiagnostic(diagnostic)}`));
  if (allDiags.length > 10) {
    lines.push(`- ... and ${allDiags.length - 10} more`);
  }

  return lines.join('\n');
};

export const formatDiagnosticsContextForSummary = (results: LspDiagnosticsResult[]): string => {
  if (results.length === 0) {
    return '';
  }

  const total = results.reduce((sum, result) => sum + result.diagnostics.length, 0);
  const reasons = collectDiagnosticsReasons(results);
  const lines = [
    `Diagnostics source: ${getDiagnosticsAggregateSourceLabel(results)}`,
    `Files checked: ${results.length}`,
    `Diagnostics found: ${total}`,
  ];

  if (reasons.length > 0) {
    lines.push(`LSP fallback reason: ${reasons.join('; ')}`);
  }

  return lines.join('\n');
};

export const formatSessionSnapshots = (sessions: LspSessionSnapshot[]): string => {
  if (sessions.length === 0) {
    return 'No active LSP sessions.';
  }

  return [
    'Active LSP sessions:',
    ...sessions.map((session) => {
      const details = [
        session.language,
        session.status,
        session.serverCommand,
        `docs:${session.openDocuments}`,
        `diags:${session.diagnosticsCount}`,
      ];
      if (session.error) {
        details.push(`error:${session.error}`);
      }
      return `- ${details.join(' | ')}`;
    }),
  ].join('\n');
};

export const formatCacheSnapshot = (cache: LspCacheSnapshot): string => {
  const byMethod = Object.entries(cache.byMethod)
    .map(([method, count]) => `${method}:${count}`)
    .join(', ');

  return [
    'LSP cache:',
    `entries: ${cache.entries}`,
    `hits: ${cache.hits}`,
    `misses: ${cache.misses}`,
    `writes: ${cache.writes}`,
    `invalidations: ${cache.invalidations}`,
    `methods: ${byMethod || 'none'}`,
  ].join('\n');
};
