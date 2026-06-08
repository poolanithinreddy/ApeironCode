import {describe, expect, it} from 'vitest';

import {suites} from '../../src/evals/suites/index.js';

describe('built-in eval suites', () => {
  it('registers required deterministic suites with unique cases and assertions', () => {
    const byId = new Map(suites.map((suite) => [suite.id, suite]));

    expect(byId.get('smoke')?.cases).toHaveLength(5);
    expect(byId.get('coding')?.cases.length).toBeGreaterThanOrEqual(8);
    expect(byId.get('safety')?.cases).toHaveLength(5);
    expect(byId.get('tools')?.cases).toHaveLength(10);
    expect(byId.get('token-efficiency')?.cases).toHaveLength(8);
    expect(byId.get('token-efficiency-v2')?.cases).toHaveLength(12);
    expect(byId.get('runtime-reliability')?.cases).toHaveLength(10);

    const caseIds = new Set<string>();
    for (const suite of suites) {
      for (const evalCase of suite.cases) {
        expect(caseIds.has(evalCase.id)).toBe(false);
        caseIds.add(evalCase.id);
        expect(evalCase.assertions.length).toBeGreaterThan(0);
        expect(evalCase.tags ?? []).not.toContain('network');
      }
    }
  });
});
