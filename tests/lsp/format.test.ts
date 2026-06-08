import {describe, expect, it} from 'vitest';

import {LspSymbolKind, type LspDiagnosticsResult, type LspSymbolQueryResult} from '../../src/lsp/types.js';
import {
  formatCacheSnapshot,
  formatDiagnosticsContextForPrompt,
  formatDiagnosticsContextForSummary,
  formatSessionSnapshots,
  formatSymbolContextForPrompt,
  formatSymbolContextForSummary,
  formatSymbolQueryResult,
} from '../../src/lsp/format.js';

const liveResult: LspSymbolQueryResult = {
  file: 'src/agent/loop.ts',
  source: 'live-lsp',
  status: {
    installed: true,
    language: 'TypeScript',
    serverCommand: 'typescript-language-server',
    serverName: 'typescript-language-server',
    status: 'available',
    workspaceApplicable: true,
  },
  symbols: [{
    kind: LspSymbolKind.Function,
    location: {
      character: 0,
      file: 'src/agent/loop.ts',
      line: 12,
    },
    name: 'runAgentLoop',
    range: {
      end: {character: 1, line: 42},
      start: {character: 0, line: 12},
    },
    source: 'lsp',
  }],
};

describe('LSP formatters', () => {
  it('formats symbol query results with source labels', () => {
    const output = formatSymbolQueryResult(liveResult);

    expect(output).toContain('source: live LSP');
    expect(output).toContain('runAgentLoop');
  });

  it('formats session and cache snapshots', () => {
    const sessionsOutput = formatSessionSnapshots([{
      diagnosticsCount: 1,
      key: 'workspace::TypeScript::typescript-language-server',
      language: 'TypeScript',
      openDocuments: 2,
      serverCommand: 'typescript-language-server',
      status: 'ready',
      workspaceRoot: '/tmp/workspace',
    }]);
    const cacheOutput = formatCacheSnapshot({
      byMethod: {documentSymbol: 1, diagnostics: 2},
      entries: 3,
      hits: 4,
      invalidations: 1,
      misses: 2,
      writes: 3,
    });

    expect(sessionsOutput).toContain('Active LSP sessions:');
    expect(sessionsOutput).toContain('TypeScript | ready');
    expect(cacheOutput).toContain('entries: 3');
    expect(cacheOutput).toContain('methods: documentSymbol:1, diagnostics:2');
  });

  it('formats prompt and summary context with fallback reasons', () => {
    const fallbackResult: LspSymbolQueryResult = {
      ...liveResult,
      reason: 'Live documentSymbol failed: request timed out while waiting for textDocument/documentSymbol',
      source: 'fallback-index',
      symbols: [{
        kind: LspSymbolKind.Function,
        location: {
          character: 0,
          file: 'src/agent/loop.ts',
          line: 12,
        },
        name: 'runAgentLoop',
        range: {
          end: {character: 1, line: 42},
          start: {character: 0, line: 12},
        },
        source: 'fallback',
      }],
    };

    const promptContext = formatSymbolContextForPrompt([fallbackResult]);
    const summaryContext = formatSymbolContextForSummary([fallbackResult]);

    expect(promptContext).toContain('source: fallback index');
    expect(promptContext).toContain('reason: Live documentSymbol failed');
    expect(summaryContext).toContain('via fallback index');
    expect(summaryContext).toContain('Live documentSymbol failed');
  });

  it('formats diagnostics context with caps and fallback details', () => {
    const diagnostics = Array.from({length: 12}, (_, index) => ({
      character: 8,
      code: `TS23${index + 1}`,
      file: 'src/auth.ts',
      line: index + 1,
      message: `issue-${index + 1}`,
      severity: 'error' as const,
      source: 'lsp' as const,
    }));
    const liveDiagnostics: LspDiagnosticsResult = {
      diagnostics,
      filePath: 'src/auth.ts',
      source: 'live-lsp',
    };
    const fallbackDiagnostics: LspDiagnosticsResult = {
      diagnostics: [],
      filePath: 'src/missing.ts',
      reason: 'TypeScript LSP unavailable',
      source: 'fallback-analysis',
    };

    const promptContext = formatDiagnosticsContextForPrompt([liveDiagnostics, fallbackDiagnostics]);
    const summaryContext = formatDiagnosticsContextForSummary([liveDiagnostics, fallbackDiagnostics]);

    expect(promptContext).toContain('Diagnostics source: mixed (live LSP + fallback analysis)');
    expect(promptContext).toContain('Files checked: 2');
    expect(promptContext).toContain('Diagnostics found: 12');
    expect(promptContext).toContain('Reason: TypeScript LSP unavailable');
    expect(promptContext).toContain('issue-10');
    expect(promptContext).not.toContain('issue-11');
    expect(promptContext).toContain('... and 2 more');
    expect(summaryContext).toContain('Diagnostics source: mixed (live LSP + fallback analysis)');
    expect(summaryContext).toContain('Files checked: 2');
    expect(summaryContext).toContain('Diagnostics found: 12');
    expect(summaryContext).toContain('LSP fallback reason: TypeScript LSP unavailable');
  });
});