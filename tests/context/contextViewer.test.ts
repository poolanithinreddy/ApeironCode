import {describe, expect, it} from 'vitest';

import {
  buildContextViewReport,
  formatContextViewReport,
} from '../../src/context/contextViewer.js';

describe('contextViewer', () => {
  it('report includes selected file count', () => {
    const report = buildContextViewReport({
      selectedFiles: [
        {path: 'src/a.ts', tokens: 100},
        {path: 'src/b.ts', tokens: 80},
      ],
    });
    expect(report.selectedFiles).toHaveLength(2);
  });

  it('report includes memory count', () => {
    const report = buildContextViewReport({
      memoryItems: [{id: 'm1', kind: 'fact', content: 'x is y'}],
    });
    expect(report.memoryItems).toHaveLength(1);
  });

  it('memory item content is truncated and not raw', () => {
    const longContent = 'a'.repeat(500);
    const report = buildContextViewReport({
      memoryItems: [{id: 'm1', kind: 'fact', content: longContent}],
    });
    expect(report.memoryItems[0]?.summary.length).toBeLessThanOrEqual(82); // 80 + ellipsis
    expect(report.memoryItems[0]?.summary).not.toBe(longContent);
  });

  it('report includes token budget', () => {
    const report = buildContextViewReport({tokenBudget: 10000, tokensUsed: 500});
    expect(report.tokenBudget).toBe(10000);
    expect(report.tokensUsed).toBe(500);
  });

  it('formatContextViewReport contains no raw secret content', () => {
    const report = buildContextViewReport({
      memoryItems: [
        {id: 'm1', kind: 'fact', content: 'AKIAIOSFODNN7EXAMPLE my secret AWS key'},
      ],
    });
    const formatted = formatContextViewReport(report);
    expect(formatted).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('omitted files listed in formatted output', () => {
    const report = buildContextViewReport({
      selectedFiles: [{path: 'src/a.ts', tokens: 1}],
      omittedFiles: [{path: 'node_modules/large.js', reason: 'ignored'}],
    });
    const formatted = formatContextViewReport(report);
    expect(formatted).toContain('Files omitted: 1');
    expect(formatted).toContain('node_modules/large.js');
  });

  it('contextMode defaults to unknown', () => {
    const report = buildContextViewReport({});
    expect(report.contextMode).toBe('unknown');
  });

  it('formatContextViewReport limits selected files display', () => {
    const selected = Array.from({length: 15}, (_, i) => ({path: `f${i}.ts`, tokens: 1}));
    const report = buildContextViewReport({selectedFiles: selected});
    const formatted = formatContextViewReport(report);
    expect(formatted).toContain('and 5 more');
  });

  it('runtimeBrain section included when provided', () => {
    const report = buildContextViewReport({
      runtimeBrain: {
        intent: 'debug-fix',
        confidence: 75,
        useBrain: true,
        selectedFiles: ['.apeironcode/VERIFY.md', '.apeironcode/RUNS.md'],
        estimatedTokens: 120,
        syncStatus: 'synced',
      },
    });
    expect(report.runtimeBrain).toBeDefined();
    expect(report.runtimeBrain?.intent).toBe('debug-fix');
    const formatted = formatContextViewReport(report);
    expect(formatted).toContain('Runtime Brain:');
    expect(formatted).toContain('debug-fix');
    expect(formatted).toContain('VERIFY.md');
  });

  it('runtimeBrain absent by default', () => {
    const report = buildContextViewReport({});
    expect(report.runtimeBrain).toBeUndefined();
    const formatted = formatContextViewReport(report);
    expect(formatted).not.toContain('Runtime Brain:');
  });

  it('runtimeBrain useBrain=false shown correctly', () => {
    const report = buildContextViewReport({
      runtimeBrain: {
        intent: 'none',
        confidence: 100,
        useBrain: false,
        selectedFiles: [],
        estimatedTokens: 0,
        syncStatus: 'off',
      },
    });
    const formatted = formatContextViewReport(report);
    expect(formatted).toContain('useBrain=false');
    expect(formatted).toContain('sync=off');
  });
});
