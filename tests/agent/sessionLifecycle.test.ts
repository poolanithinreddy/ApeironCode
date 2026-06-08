import {describe, expect, it} from 'vitest';

import {mergeUsageBreakdown} from '../../src/agent/sessionLifecycle.js';

describe('agent session lifecycle helpers', () => {
  it('merges usage totals and groups breakdown entries by provider and model', () => {
    const merged = mergeUsageBreakdown(
      {
        breakdown: [{
          calls: 1,
          estimatedCostUsd: 0.01,
          inputTokens: 10,
          model: 'm1',
          outputTokens: 20,
          provider: 'mock',
        }],
        estimatedCostUsd: 0.01,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      {
        breakdown: [{
          calls: 2,
          estimatedCostUsd: 0.02,
          inputTokens: 30,
          model: 'm1',
          outputTokens: 40,
          provider: 'mock',
        }],
        estimatedCostUsd: 0.02,
        inputTokens: 30,
        outputTokens: 40,
        totalTokens: 70,
      },
    );

    expect(merged).toMatchObject({
      estimatedCostUsd: 0.03,
      inputTokens: 40,
      outputTokens: 60,
      totalTokens: 100,
    });
    expect(merged?.breakdown).toEqual([{
      calls: 3,
      estimatedCostUsd: 0.03,
      inputTokens: 40,
      model: 'm1',
      outputTokens: 60,
      provider: 'mock',
    }]);
  });
});
