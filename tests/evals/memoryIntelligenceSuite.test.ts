import {describe, expect, it} from 'vitest';
import {memoryIntelligenceSuite} from '../../src/evals/suites/memoryIntelligence.js';
import {getEvalSuite} from '../../src/evals/suites/index.js';

describe('memoryIntelligenceSuite structure', () => {
  it('has correct suite id and description', () => {
    expect(memoryIntelligenceSuite.id).toBe('memory-intelligence');
    expect(memoryIntelligenceSuite.description).toBeTruthy();
    expect(memoryIntelligenceSuite.description.length).toBeGreaterThan(10);
  });

  it('has 12 eval cases', () => {
    expect(memoryIntelligenceSuite.cases).toHaveLength(12);
  });

  it('all cases have required fields', () => {
    for (const c of memoryIntelligenceSuite.cases) {
      expect(c.id).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.prompt).toBeTruthy();
      expect(c.mode).toBeTruthy();
      expect(c.assertions.length).toBeGreaterThan(0);
    }
  });

  it('all case IDs are unique', () => {
    const ids = memoryIntelligenceSuite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all cases have at least one assertion', () => {
    for (const c of memoryIntelligenceSuite.cases) {
      expect(c.assertions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is registered in the global suite index', () => {
    const suite = getEvalSuite('memory-intelligence');
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('memory-intelligence');
  });

  it('covers key memory behaviors', () => {
    const ids = new Set(memoryIntelligenceSuite.cases.map((c) => c.id));
    expect(ids.has('memory-does-not-store-secret')).toBe(true);
    expect(ids.has('memory-supersedes-stale-fact')).toBe(true);
    expect(ids.has('memory-respects-token-budget')).toBe(true);
    expect(ids.has('memory-recalls-architecture-decision')).toBe(true);
    expect(ids.has('memory-provenance-for-important-facts')).toBe(true);
    expect(ids.has('memory-excludes-deprecated-facts')).toBe(true);
  });
});
