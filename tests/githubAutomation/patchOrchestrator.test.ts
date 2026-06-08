import {describe, expect, it, vi} from 'vitest';
import {
  buildPatchCommitMessage,
  buildSafeFailureComment,
  enforcePatchLimits,
  isTransientGitHubError,
  measurePatch,
  retryWithBackoff,
  withCheckpoint,
} from '../../src/githubAutomation/patchOrchestrator.js';

describe('patch limits', () => {
  it('rejects when too many files', () => {
    const summary = {bytes: 100, files: 100};
    const result = enforcePatchLimits(summary, {maxChangedFiles: 10});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('rejected-too-many-files');
  });

  it('rejects when diff bytes exceed limit', () => {
    const summary = {bytes: 10_000_000, files: 1};
    const result = enforcePatchLimits(summary);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('rejected-too-large');
  });

  it('accepts within limits', () => {
    expect(enforcePatchLimits(measurePatch(['a.ts'], 'small diff')).ok).toBe(true);
  });
});

describe('retry strategy', () => {
  it('retries on transient errors and succeeds', async () => {
    let attempts = 0;
    const result = await retryWithBackoff((): Promise<string> => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.reject(new Error('503 Service Unavailable'));
      }
      return Promise.resolve('ok');
    }, {sleep: () => Promise.resolve()});
    expect(attempts).toBe(3);
    expect(result).toBe('ok');
  });

  it('throws immediately on non-transient errors', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('not found 404')));
    await expect(retryWithBackoff(fn, {sleep: () => Promise.resolve()})).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('classifies common transient signals', () => {
    expect(isTransientGitHubError(new Error('rate limit exceeded'))).toBe(true);
    expect(isTransientGitHubError(new Error('502 Bad Gateway'))).toBe(true);
    expect(isTransientGitHubError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isTransientGitHubError(new Error('Not Found'))).toBe(false);
  });
});

describe('checkpoint', () => {
  it('rolls back on failure', async () => {
    const captured: number[] = [];
    let value = 1;
    const result = await withCheckpoint<number, void>(
      {
        capture: () => {
          captured.push(value);
          return Promise.resolve(value);
        },
        restore: (state) => {
          value = state;
          return Promise.resolve();
        },
      },
      (): Promise<void> => {
        value = 99;
        return Promise.reject(new Error('boom'));
      },
    );
    expect(value).toBe(1);
    expect(result.checkpoint.restored).toBe(true);
    expect(captured).toEqual([1]);
  });

  it('does not rollback on success', async () => {
    let value = 1;
    const result = await withCheckpoint<number, number>(
      {
        capture: () => Promise.resolve(value),
        restore: () => Promise.reject(new Error('should not be called')),
      },
      () => {
        value = 2;
        return Promise.resolve(value);
      },
    );
    expect(value).toBe(2);
    expect(result.checkpoint.restored).toBe(false);
    expect(result.result).toBe(2);
  });
});

describe('commit + failure message', () => {
  it('commit message includes issue reference', () => {
    const msg = buildPatchCommitMessage({issueOrPrNumber: 42, ref: 'issue', workflow: 'ci-fix', summary: 'fixing tests'});
    expect(msg).toMatch(/issue #42/);
    expect(msg).toContain('ci-fix');
  });

  it('safe failure comment is human-readable', () => {
    const c = buildSafeFailureComment({reason: 'Diff too large', workflow: 'ci-fix'});
    expect(c).toContain('ApeironCode automation could not complete');
    expect(c).toContain('No changes were committed');
  });
});
