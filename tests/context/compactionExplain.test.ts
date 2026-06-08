import {describe, expect, it} from 'vitest';

import {
  explainContextCompaction,
  formatCompactionExplanation,
} from '../../src/context/compactionExplain.js';

describe('compactionExplain', () => {
  it('preserved items correctly identified', () => {
    const explanation = explainContextCompaction(
      {items: ['a', 'b', 'c'], tokens: 1000},
      {items: ['a', 'b'], tokens: 600},
      'budget tightened',
    );
    expect(explanation.preservedItems).toEqual(['a', 'b']);
  });

  it('omitted items correctly identified', () => {
    const explanation = explainContextCompaction(
      {items: ['a', 'b', 'c'], tokens: 1000},
      {items: ['a'], tokens: 200},
      'reason',
    );
    expect(explanation.omittedItems).toEqual(['b', 'c']);
  });

  it('tokensSaved calculated', () => {
    const explanation = explainContextCompaction(
      {items: ['a'], tokens: 2000},
      {items: ['a'], tokens: 500},
      'reason',
    );
    expect(explanation.tokensSaved).toBe(1500);
  });

  it('tokensSaved is never negative', () => {
    const explanation = explainContextCompaction(
      {items: ['a'], tokens: 100},
      {items: ['a'], tokens: 200},
      'reason',
    );
    expect(explanation.tokensSaved).toBe(0);
  });

  it('warning emitted when items omitted', () => {
    const explanation = explainContextCompaction(
      {items: ['a', 'b'], tokens: 100},
      {items: ['a'], tokens: 50},
      'reason',
    );
    expect(explanation.warnings).toHaveLength(1);
    expect(explanation.warnings[0]).toContain('1 items omitted');
  });

  it('summarized items detected by summary: prefix', () => {
    const explanation = explainContextCompaction(
      {items: ['file:a.ts', 'file:b.ts'], tokens: 1000},
      {items: ['file:a.ts', 'summary:b.ts'], tokens: 400},
      'compress b',
    );
    expect(explanation.summarizedItems).toEqual(['summary:b.ts']);
  });

  it('formatCompactionExplanation is concise and readable', () => {
    const explanation = explainContextCompaction(
      {items: ['a', 'b', 'c'], tokens: 1000},
      {items: ['a'], tokens: 300},
      'over budget',
    );
    const formatted = formatCompactionExplanation(explanation);
    expect(formatted).toContain('over budget');
    expect(formatted).toContain('1000');
    expect(formatted).toContain('300');
    expect(formatted).toContain('saved 700');
  });
});
