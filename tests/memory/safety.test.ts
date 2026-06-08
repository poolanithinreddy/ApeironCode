import {describe, expect, it} from 'vitest';

import {
  containsSecretLikeContent,
  detectSecretLikeContent,
  isMostlySecretMaterial,
  redactSecretLikeContent,
} from '../../src/memory/safety.js';

describe('memory safety', () => {
  it('detects and redacts common secret formats', () => {
    const text = [
      'OPENAI_API_KEY=sk-test-key-12345',
      'github token ghp_1234567890abcdefghijklmnopqrstuv',
      'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
    ].join('\n');

    expect(detectSecretLikeContent(text).length).toBeGreaterThanOrEqual(3);
    expect(redactSecretLikeContent(text)).not.toContain('sk-test-key-12345');
    expect(redactSecretLikeContent(text)).not.toContain('ghp_1234567890abcdefghijklmnopqrstuv');
    expect(redactSecretLikeContent(text)).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('identifies mostly-secret material without flagging normal memory', () => {
    expect(isMostlySecretMaterial('PASSWORD=hunter2')).toBe(true);
    expect(containsSecretLikeContent('run npm test before changing src/agent/Agent.ts')).toBe(false);
    expect(isMostlySecretMaterial('Project uses provider.stream() after Phase 1')).toBe(false);
  });
});
