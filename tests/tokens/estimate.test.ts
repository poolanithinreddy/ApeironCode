import {describe, expect, it} from 'vitest';
import {addTokenBreakdown, createEmptyTokenBreakdown, estimateObjectTokens, estimateTokens, formatTokenBreakdown} from '../../src/tokens/estimate.js';

describe('token estimation', () => {
  it('is deterministic for text, code, json, empty input, and long logs', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('export const x = () => ({ok: true});')).toBeGreaterThan(5);
    expect(estimateObjectTokens({a: 1, b: ['x']})).toBeGreaterThan(1);
    const longLog = Array.from({length: 100}, (_, i) => `line ${i} failed at src/a.ts:${i}`).join('\n');
    expect(estimateTokens(longLog)).toBe(estimateTokens(longLog));
  });

  it('formats and adds breakdowns', () => {
    const left = {...createEmptyTokenBreakdown(), system: 2, total: 2};
    const right = {...createEmptyTokenBreakdown(), user: 3, total: 3};
    expect(addTokenBreakdown(left, right).total).toBe(5);
    expect(formatTokenBreakdown(addTokenBreakdown(left, right))).toContain('system=2');
  });
});
