import {describe, expect, it} from 'vitest';

import {createAuthFailureMessage} from '../../src/agent/loopFinalMessages.js';

describe('createAuthFailureMessage', () => {
  it('reuses the in-flight streaming id so the error replaces the empty block', () => {
    const msg = createAuthFailureMessage('GitHub Models rejected the request payload (400): bad', 'stream-123');
    expect(msg.id).toBe('stream-123');
    expect(msg.role).toBe('assistant');
    expect(msg.content).toContain('rejected the request payload');
  });

  it('falls back to a generated id when none is provided', () => {
    const a = createAuthFailureMessage('x');
    const b = createAuthFailureMessage('x');
    expect(a.id).not.toBe(b.id);
    expect(a.content).toBe('x');
  });
});
