import {describe, expect, it} from 'vitest';

import {tokenEfficiencyV2Suite} from '../../src/evals/suites/tokenEfficiencyV2.js';
import {suites} from '../../src/evals/suites/index.js';

describe('token efficiency v2 eval suite', () => {
  it('registers the suite with the expected deterministic cases', () => {
    expect(suites.some((suite) => suite.id === 'token-efficiency-v2')).toBe(true);
    expect(tokenEfficiencyV2Suite.cases).toHaveLength(12);
    expect(tokenEfficiencyV2Suite.cases.map((item) => item.id)).toContain('tev2-context-delta');
    expect(tokenEfficiencyV2Suite.cases.map((item) => item.id)).toContain('tev2-coding-success-after-compression');
  });
});
