import {describe, expect, it} from 'vitest';

import {classifyError, formatDebugError, formatUserError, redactError} from '../../src/utils/errorFormat.js';

describe('errorFormat', () => {
  it('classifies and redacts user/debug errors', () => {
    expect(classifyError(new Error('Missing API key'))).toBe('auth');
    expect(classifyError(new Error('Docker permission denied'))).toBe('sandbox');
    expect(classifyError(new Error('ECONNRESET'))).toBe('network');
    expect(redactError('Authorization: Bearer secret-token')).not.toContain('secret-token');
    expect(formatUserError(new Error('Missing API key'))).toContain('Check the required environment variable');
    expect(formatDebugError(new Error('token=secret'))).not.toContain('token=secret');
  });
});
