import {describe, expect, it} from 'vitest';

import {classifyProviderError} from '../../src/providers/errorClassification.js';

describe('provider error classification', () => {
  it('classifies retryable provider failures', () => {
    expect(classifyProviderError(new Error('429 rate limit')).kind).toBe('rate-limit');
    expect(classifyProviderError(new Error('request timed out')).kind).toBe('timeout');
    expect(classifyProviderError(new Error('malformed tool call')).kind).toBe('malformed-tool-call');
    expect(classifyProviderError(new Error('model not found')).kind).toBe('model-unavailable');
    expect(classifyProviderError(new Error('missing API key')).retryable).toBe(true);
    expect(classifyProviderError(new Error('logic bug')).retryable).toBe(true);
  });
});
