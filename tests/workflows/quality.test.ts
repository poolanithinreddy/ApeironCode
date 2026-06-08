import {describe, expect, it} from 'vitest';

import {formatWorkflowList, formatWorkflowRun} from '../../src/workflows/quality.js';

describe('quality workflows', () => {
  it('lists and formats workflow run plans', () => {
    expect(formatWorkflowList()).toContain('fix-tests');
    expect(formatWorkflowRun('fix-tests', 'math failure')).toContain('math failure');
  });
});
