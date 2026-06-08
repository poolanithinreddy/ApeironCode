import {describe, expect, it} from 'vitest';

import {buildConciseFinalSummary} from '../../src/agent/finalSummary.js';
import {formatApprovalReview} from '../../src/safety/approvalFormat.js';
import {normalizeStatusLabel, renderCompactStatusLine} from '../../src/ui/statusLine.js';
import {stripAnsi} from '../../src/ui/theme.js';
import {buildToolCardView, renderToolLine} from '../../src/ui/toolCards.js';

/**
 * Phase 18B terminal-UX dogfood. These assertions exercise the exact pure
 * view-models the Ink components render (StatusBar, ToolCard, ApprovalPrompt,
 * final summary), so the calm/compact normal-mode contract is locked in
 * without a live terminal. Fully offline and deterministic.
 */
describe('terminal UX dogfood (Phase 18B)', () => {
  const readCall = {id: '1', toolName: 'read_file', status: 'success', input: {path: 'calculator/index.html'}};
  const writeCall = {
    id: '2',
    toolName: 'write_file',
    status: 'success',
    input: {path: 'calculator/styles.css'},
    result: {summary: 'wrote', diff: '--- a\n+++ b\n+body{display:flex}', metadata: {addedLines: 42, removedLines: 12, editId: 'e7'}},
  };
  const runCall = {id: '3', toolName: 'run_command', status: 'success', input: {command: 'npm run build'}};

  it('1+3. build calculator: tool cards are compact one-liners', () => {
    expect(renderToolLine(readCall)).toBe('✓ Read calculator/index.html');
    expect(renderToolLine(writeCall)).toContain('Write calculator/styles.css');
    expect(renderToolLine(writeCall)).toContain('+42/-12');
    expect(renderToolLine(runCall)).toBe('✓ Run npm run build');
  });

  it('2. approval card lists the actual files and never shows "Files affected: none"', () => {
    const review = formatApprovalReview({
      action: 'Approve file plan',
      preview: 'Plan: build calculator\nFiles:\n- create calculator/index.html\n- create calculator/styles.css',
      reason: 'Apply calculator UI',
      riskLevel: 'medium',
      target: 'calculator/index.html, calculator/styles.css',
    });
    expect(review).toContain('- calculator/index.html');
    expect(review).toContain('- calculator/styles.css');
    expect(review).not.toContain('Files affected: none');
    expect(review).toContain('Risk: medium');
  });

  it('4. normal mode never spams a raw diff', () => {
    const line = renderToolLine(writeCall);
    expect(line).not.toContain('+++');
    expect(line).not.toContain('body{display:flex}');
  });

  it('5. final summary is compact and not duplicated', () => {
    const summary = buildConciseFinalSummary({
      baseSummary: 'Built the calculator app.\n\nFiles changed: calculator/index.html, calculator/styles.css',
      taskPlan: null,
      taskState: {filesChanged: ['calculator/index.html', 'calculator/styles.css']} as never,
    });
    // The base already lists "Files changed:" — no duplicate footer line.
    expect(summary.match(/Files changed:/gu)?.length).toBe(1);
    expect(summary.split('\n').length).toBeLessThan(8);
  });

  it('6. failure card is concise and tool-specific', () => {
    const line = renderToolLine({toolName: 'read_file', status: 'error', error: 'read_file requires path', input: {}});
    expect(line.startsWith('✗ Read')).toBe(true);
    expect(line).toContain('read_file requires path');
    expect(line.split('\n').length).toBe(1);
  });

  it('7. debug/verbose surfaces edit id + diff metadata that normal mode hides', () => {
    const normal = renderToolLine(writeCall);
    const verbose = renderToolLine(writeCall, {verbose: true});
    expect(normal).toContain('/revert e7');
    expect(verbose).toContain('edit e7');
    const view = buildToolCardView(writeCall);
    expect(view.editId).toBe('e7');
    expect(view.diffSummary).toBe('+42/-12');
  });

  it('8. provider/model visible in compact header', () => {
    const header = stripAnsi(renderCompactStatusLine({provider: 'openai', model: 'gpt-4o', workspace: 'calculator-test', status: 'ready'}, {colorMode: 'no-color'}));
    expect(header).toContain('openai/gpt-4o');
    expect(header).toContain('calculator-test');
  });

  it('9+10. waiting/approval status renders cleanly', () => {
    expect(normalizeStatusLabel('awaiting_approval')).toBe('awaiting approval');
    expect(normalizeStatusLabel('applying')).toBe('applying');
    expect(normalizeStatusLabel('validating')).toBe('validating');
    const header = stripAnsi(renderCompactStatusLine({provider: 'openai', model: 'gpt-4o', workspace: 'r', status: 'awaiting_approval'}, {colorMode: 'no-color'}));
    expect(header).toContain('awaiting approval');
  });
});
