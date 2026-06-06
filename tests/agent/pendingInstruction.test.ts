import {describe, expect, it} from 'vitest';

import {
  createPendingInstruction,
  detectIncompleteSetupPhrase,
  isContinuationInstruction,
  mergePendingInstruction,
} from '../../src/agent/pendingInstruction.js';

describe('pendingInstruction', () => {
  it('detects bare setup phrases that lack detail', () => {
    expect(detectIncompleteSetupPhrase('do the following changes in the web app')).toBe(true);
    expect(detectIncompleteSetupPhrase('make these changes')).toBe(true);
    expect(detectIncompleteSetupPhrase('apply these changes:')).toBe(true);
  });

  it('does not treat setup phrases that already include detail as pending', () => {
    expect(
      detectIncompleteSetupPhrase('do the following changes: 1. make the background black'),
    ).toBe(false);
    expect(detectIncompleteSetupPhrase('make the UI premium with a dark background')).toBe(false);
  });

  it('recognizes continuation instructions', () => {
    expect(isContinuationInstruction('1. Make the UI premium with a true black background.')).toBe(true);
    expect(isContinuationInstruction('- add notes to tasks')).toBe(true);
    expect(isContinuationInstruction('also keep localStorage')).toBe(true);
    expect(isContinuationInstruction('hi there')).toBe(false);
  });

  it('merges pending task with the follow-up instruction', () => {
    const pending = createPendingInstruction('do the following changes in the web app');
    const merged = mergePendingInstruction(pending, '1. Make the UI premium with a true black background.');
    expect(merged).toContain('do the following changes in the web app');
    expect(merged).toContain('Make the UI premium');
  });
});
