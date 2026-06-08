import {describe, expect, it} from 'vitest';

import {formatSecurityLimits, getSecurityLimits} from '../../src/safety/securityStatus.js';

describe('security status', () => {
  it('states explicit non-goals without claiming sandboxing', () => {
    expect(getSecurityLimits().some((limit) => limit.label === 'OS sandboxing')).toBe(true);
    expect(formatSecurityLimits()).toContain('Per-subagent credential isolation: not-enabled');
    expect(formatSecurityLimits()).toContain('Parallel editing: not-enabled');
  });
});
