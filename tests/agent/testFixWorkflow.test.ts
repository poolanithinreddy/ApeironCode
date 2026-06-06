import {describe, expect, it} from 'vitest';

import {createTestFixContext} from '../../src/agent/testFixWorkflow.js';

describe('test fix workflow', () => {
  it('parses Node test output without treating durations as file paths', () => {
    const context = createTestFixContext([
      '✖ allows the maximum score (0.948667ms)',
      '  test at test/math.test.js:5:1',
      'ℹ tests 1',
      'ℹ pass 0',
      'ℹ fail 1',
      '✖ failing tests:',
      '✖ allows the maximum score (0.948667ms)',
    ].join('\n'));

    expect(context.getResult()).toMatchObject({
      failed: 1,
      failedTests: ['allows the maximum score'],
      passed: 0,
      success: false,
      totalTests: 1,
    });
    expect(context.getAffectedFiles()).toEqual([
      'src/math.js',
      'test/math.test.js',
    ]);
  });
});
