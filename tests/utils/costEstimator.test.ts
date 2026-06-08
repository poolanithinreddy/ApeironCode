import {describe, expect, it} from 'vitest';

import {estimateCost, formatCostEstimate, getModelPricing} from '../../src/utils/costEstimator.js';

describe('costEstimator', () => {
  it('uses catalog pricing when available and handles unknown pricing safely', () => {
    expect(getModelPricing('mock', 'mock-coder')).toEqual({inputCostPer1kTokens: 0, outputCostPer1kTokens: 0});
    const known = estimateCost('openai', 'gpt-4.1-mini', {inputTokens: 1000, outputTokens: 500});
    expect(known.estimatedCostUsd).toBeCloseTo(0.0012);
    expect(formatCostEstimate({...known, tokenBreakdown: {context: 10, memory: 5, output: 3, tools: 2, toolResults: 1}})).toContain('Breakdown');

    const unknown = estimateCost('nope', 'model', {inputTokens: 1, outputTokens: 1});
    expect(unknown.estimatedCostUsd).toBeNull();
    expect(formatCostEstimate(unknown)).toContain('Pricing unavailable');
  });
});
