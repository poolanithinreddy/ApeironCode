import {describe, expect, it} from 'vitest';

import {
  computeContextDelta,
  computeContextFingerprint,
  formatContextDeltaForPrompt,
  shouldUseFullContext,
} from '../../src/context/contextDelta.js';

describe('context delta', () => {
  it('returns a small delta for identical context', () => {
    const snapshot = {
      files: ['src/a.ts'],
      fingerprint: computeContextFingerprint({files: ['src/a.ts'], mode: 'edit', promptContext: 'FILE: src/a.ts\ncode'}),
      mode: 'edit',
      promptContext: 'FILE: src/a.ts\ncode',
    };
    const delta = computeContextDelta(snapshot, {files: ['src/a.ts'], mode: 'edit', promptContext: 'FILE: src/a.ts\ncode'});
    expect(delta.unchanged).toBe(true);
    expect(shouldUseFullContext(delta, 'edit')).toBe(false);
    expect(formatContextDeltaForPrompt(delta)).toContain('unchanged');
  });

  it('uses full context when mode changes and reports changed files otherwise', () => {
    const previous = {
      files: ['src/a.ts'],
      fingerprint: computeContextFingerprint({files: ['src/a.ts'], mode: 'edit', promptContext: 'FILE: src/a.ts\ncode'}),
      mode: 'edit',
      promptContext: 'FILE: src/a.ts\ncode',
    };
    const changed = computeContextDelta(previous, {files: ['src/a.ts', 'src/b.ts'], mode: 'edit', promptContext: 'FILE: src/a.ts\ncode\n\nFILE: src/b.ts\nmore'});
    expect(changed.changedFiles).toContain('src/b.ts');
    expect(changed.tokenSavings).toBeGreaterThanOrEqual(0);

    const switched = computeContextDelta(previous, {files: ['src/a.ts'], mode: 'debug', promptContext: 'FILE: src/a.ts\ncode'});
    expect(shouldUseFullContext(switched, 'debug')).toBe(true);
  });
});
