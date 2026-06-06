import {describe, expect, it} from 'vitest';
import {runSuite} from '../../src/evals/runner.js';
import {tokenEfficiencySuite} from '../../src/evals/suites/tokenEfficiency.js';

describe('token efficiency eval suite', () => {
  it('runs deterministically and records token efficiency metrics', async () => {
    const summary = await runSuite(tokenEfficiencySuite);
    expect(summary.passed).toBe(summary.total);
    expect(summary.tokenEfficiency.totalEstimatedTokens).toBeGreaterThan(0);
    expect(summary.tokenEfficiency.successPer1kTokens).toBeGreaterThan(0);
    expect(summary.results.some((result) => (result.tokenEfficiency.compressionRatio ?? 1) < 1)).toBe(true);
  });
});
