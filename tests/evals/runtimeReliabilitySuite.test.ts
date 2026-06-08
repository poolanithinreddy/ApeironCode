import {describe, expect, it} from 'vitest';

import {runtimeReliabilitySuite} from '../../src/evals/suites/runtimeReliability.js';
import {getEvalSuite} from '../../src/evals/suites/index.js';

describe('runtimeReliabilitySuite', () => {
  it('registers runtime reliability cases', () => {
    expect(runtimeReliabilitySuite.id).toBe('runtime-reliability');
    expect(runtimeReliabilitySuite.cases).toHaveLength(10);
    expect(getEvalSuite('runtime-reliability')).toBe(runtimeReliabilitySuite);
  });

  it('covers required runtime behaviors', () => {
    const ids = new Set(runtimeReliabilitySuite.cases.map((evalCase) => evalCase.id));
    expect(ids).toEqual(new Set([
      'runtime-plan-act-verify-simple-edit',
      'runtime-checkpoint-before-edit',
      'runtime-rollback-after-failing-verification',
      'runtime-malformed-tool-input-recovery',
      'runtime-repeated-tool-failure-stops',
      'runtime-diff-budget-blocks-excessive-change',
      'runtime-protected-path-requires-approval',
      'runtime-test-fix-reruns-failing-test',
      'runtime-cancellation-snapshot-resumable',
      'runtime-summary-includes-tools-changes-verification',
    ]));
  });
});
