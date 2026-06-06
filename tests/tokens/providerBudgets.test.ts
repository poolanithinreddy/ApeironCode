import {describe, expect, it} from 'vitest';

import {
  formatTokenBudgetProfile,
  getModelTokenBudget,
  getReservedOutputBudget,
  getSafeInputBudget,
} from '../../src/tokens/providerBudgets.js';

describe('provider token budgets', () => {
  it('uses known model context windows', () => {
    const profile = getModelTokenBudget('anthropic', 'claude-3-5-sonnet-latest', 'debug');
    expect(profile.contextWindow).toBe(200000);
    expect(profile.safeInputTokens).toBeGreaterThan(profile.memoryBudget);
    expect(profile.toolSchemaBudget).toBeGreaterThan(0);
    expect(formatTokenBudgetProfile(profile)).toContain('anthropic/claude-3-5-sonnet-latest');
  });

  it('falls back conservatively for unknown models', () => {
    const profile = getModelTokenBudget('unknown', 'mystery-model');
    expect(profile.contextWindow).toBe(32000);
    expect(profile.warnings.length).toBeGreaterThan(0);
    expect(getSafeInputBudget('unknown', 'mystery-model')).toBe(profile.safeInputTokens);
    expect(getReservedOutputBudget('unknown', 'mystery-model', 'explain')).toBeGreaterThan(0);
  });
});
