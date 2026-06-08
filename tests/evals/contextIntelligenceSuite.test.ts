import {describe, expect, it} from 'vitest';
import {contextIntelligenceSuite} from '../../src/evals/suites/contextIntelligence.js';
import {getEvalSuite, getEvalSuiteIds} from '../../src/evals/suites/index.js';

describe('contextIntelligenceSuite', () => {
  it('declares 10 cases covering required behaviors', () => {
    expect(contextIntelligenceSuite.cases).toHaveLength(10);
    const ids = contextIntelligenceSuite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is registered in the global suites list', () => {
    expect(getEvalSuiteIds()).toContain('contextIntelligence');
    expect(getEvalSuite('contextIntelligence')).toBeDefined();
  });

  it('every case carries non-trivial assertions', () => {
    for (const c of contextIntelligenceSuite.cases) {
      expect(c.assertions.length).toBeGreaterThan(0);
      expect(c.prompt.length).toBeGreaterThan(20);
    }
  });
});
