import {describe, expect, it} from 'vitest';

import {summarizeUsageSnapshots} from '../../src/providers/costTracker.js';

describe('summarizeUsageSnapshots', () => {
  it('aggregates usage totals and model breakdowns across sessions', () => {
    const summary = summarizeUsageSnapshots([
      {
        breakdown: [
          {
            calls: 2,
            estimatedCostUsd: 0.002,
            inputTokens: 1200,
            model: 'mock-coder',
            outputTokens: 300,
            provider: 'mock',
          },
        ],
        estimatedCostUsd: 0.002,
        inputTokens: 1200,
        outputTokens: 300,
      },
      {
        breakdown: [
          {
            calls: 1,
            estimatedCostUsd: 0.0015,
            inputTokens: 500,
            model: 'mock-coder',
            outputTokens: 250,
            provider: 'mock',
          },
          {
            calls: 1,
            estimatedCostUsd: 0.0005,
            inputTokens: 100,
            model: 'mock-reasoner',
            outputTokens: 100,
            provider: 'mock',
          },
        ],
        estimatedCostUsd: 0.002,
        inputTokens: 600,
        outputTokens: 350,
      },
    ]);

    expect(summary.totalInputTokens).toBe(1800);
    expect(summary.totalOutputTokens).toBe(650);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(0.004, 6);
    expect(summary.breakdown).toMatchObject([
      {
        calls: 3,
        inputTokens: 1700,
        model: 'mock-coder',
        outputTokens: 550,
        provider: 'mock',
      },
      {
        calls: 1,
        inputTokens: 100,
        model: 'mock-reasoner',
        outputTokens: 100,
        provider: 'mock',
      },
    ]);
  });
});