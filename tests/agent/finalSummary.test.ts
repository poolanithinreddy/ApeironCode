import {describe, expect, it} from 'vitest';

import {buildStandardizedFinalSummary} from '../../src/agent/finalSummary.js';

describe('buildStandardizedFinalSummary', () => {
  it('includes the code intelligence summary in the execution footer', () => {
    const summary = buildStandardizedFinalSummary({
      baseSummary: 'Implemented the requested change.',
      codeIntelligenceSummary: [
        'Code Intelligence: LSP (typescript-language-server)',
        'Diagnostics source: live LSP',
        'Files checked: 2',
        'Diagnostics found: 3',
      ].join('\n'),
      goal: 'Explain current code-intelligence state',
      memorySuggestions: [],
      mode: 'explain',
      modeLabel: 'explain (inferred from prompt)',
      toolCalls: [],
    });

    expect(summary).toContain('Code Intelligence: LSP (typescript-language-server)');
    expect(summary).toContain('Diagnostics source: live LSP');
    expect(summary).toContain('Files checked: 2');
    expect(summary).toContain('Mode: explain (inferred from prompt)');
  });
});