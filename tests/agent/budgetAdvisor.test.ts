import {describe, expect, it} from 'vitest';

import {analyzeBudget} from '../../src/agent/budgetAdvisor.js';

describe('analyzeBudget', () => {
  it('uses mode base budgets', () => {
    expect(analyzeBudget('build feature', 'feature', 200).recommended).toBe(30);
    expect(analyzeBudget('debug issue', 'debug', 200).recommended).toBe(20);
    expect(analyzeBudget('fix tests', 'test-fix', 200).recommended).toBe(25);
    expect(analyzeBudget('review diff', 'review', 200).recommended).toBe(15);
    expect(analyzeBudget('explain repo', 'explain', 200).recommended).toBe(10);
    expect(analyzeBudget('chat', 'chat', 200).recommended).toBe(20);
  });

  it('increases budget for file references and bug prompts', () => {
    const advice = analyzeBudget('fix bug in src/a.ts and tests/a.test.ts with stack trace', 'debug', 200);

    expect(advice.recommended).toBe(31);
    expect(advice.signals).toEqual(expect.arrayContaining(['file-references:+6', 'bug-or-error:+5']));
  });

  it('increases budget for multi-file and large rewrite prompts', () => {
    const advice = analyzeBudget('rewrite architecture change across multiple files', 'feature', 200);

    expect(advice.recommended).toBe(60);
    expect(advice.signals).toEqual(expect.arrayContaining(['multi-file:+10', 'large-change:+20']));
  });

  it('reduces simple explain prompts', () => {
    expect(analyzeBudget('brief explain only no edits', 'explain', 200).recommended).toBe(5);
  });

  it('respects configurable cap, minimum, and hard max 200', () => {
    expect(analyzeBudget('rewrite architecture change across multiple files', 'feature', 40).recommended).toBe(40);
    expect(analyzeBudget('brief explain only no edits', 'explain', 40).recommended).toBe(5);
    expect(analyzeBudget('rewrite architecture change across multiple files src/a.ts src/b.ts src/c.ts', 'feature', 500).recommended).toBeLessThanOrEqual(200);
  });
});
