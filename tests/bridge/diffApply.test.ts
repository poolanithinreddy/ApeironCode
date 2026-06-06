/**
 * Tests for bridge diff apply flow.
 */

import {describe, it, expect, vi} from 'vitest';
import {
  validateDiffApplyPayload,
  executeDiffApplyRequest,
  formatDiffApplyResultPayload,
  isRiskyPath,
  isSafeWorkspaceRelativePath,
} from '../../src/bridge/diffApply.js';
import {AppError} from '../../src/utils/errors.js';

describe('isRiskyPath', () => {
  it('flags .env files', () => {
    expect(isRiskyPath('.env')).toBe(true);
    expect(isRiskyPath('.env.local')).toBe(true);
  });

  it('flags package.json', () => {
    expect(isRiskyPath('package.json')).toBe(true);
    expect(isRiskyPath('package-lock.json')).toBe(true);
  });

  it('flags node_modules paths', () => {
    expect(isRiskyPath('node_modules/foo/bar.js')).toBe(true);
  });

  it('does not flag normal source files', () => {
    expect(isRiskyPath('src/app.ts')).toBe(false);
    expect(isRiskyPath('README.md')).toBe(false);
    expect(isRiskyPath('tests/foo.test.ts')).toBe(false);
  });
});

describe('isSafeWorkspaceRelativePath', () => {
  it('rejects traversal', () => {
    expect(isSafeWorkspaceRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeWorkspaceRelativePath('foo/../../bar')).toBe(false);
  });

  it('accepts normal relative paths', () => {
    expect(isSafeWorkspaceRelativePath('src/app.ts')).toBe(true);
    expect(isSafeWorkspaceRelativePath('packages/a/src/x.ts')).toBe(true);
  });
});

describe('validateDiffApplyPayload', () => {
  const validPayload = {
    requestId: 'req-abc',
    files: [{path: 'src/foo.ts', additions: 5, deletions: 2}],
    approved: false,
  };

  it('accepts valid payload', () => {
    const result = validateDiffApplyPayload(validPayload);
    expect(result.ok).toBe(true);
  });

  it('rejects missing requestId', () => {
    const result = validateDiffApplyPayload({...validPayload, requestId: ''});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_REQUEST_ID');
  });

  it('rejects empty files array', () => {
    const result = validateDiffApplyPayload({...validPayload, files: []});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_FILES');
  });

  it('rejects huge diff patch', () => {
    const result = validateDiffApplyPayload({
      ...validPayload,
      patch: 'x'.repeat(60_000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DIFF_TOO_LARGE');
  });

  it('rejects path traversal', () => {
    const result = validateDiffApplyPayload({
      ...validPayload,
      files: [{path: '../etc/passwd', additions: 1, deletions: 0}],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_PATH');
  });

  it('parses approved flag correctly', () => {
    const r1 = validateDiffApplyPayload({...validPayload, approved: true});
    if (!r1.ok) throw new Error('should be ok');
    expect(r1.value.approved).toBe(true);

    const r2 = validateDiffApplyPayload({...validPayload, approved: false});
    if (!r2.ok) throw new Error('should be ok');
    expect(r2.value.approved).toBe(false);
  });

  it('accepts valid patchOperations', () => {
    const r = validateDiffApplyPayload({
      ...validPayload,
      approved: true,
      files: [{path: 'src/a.ts', additions: 1, deletions: 0}],
      patchOperations: [{type: 'search_replace', search: 'x', replace: 'y'}],
    });
    expect(r.ok).toBe(true);
  });
});

describe('executeDiffApplyRequest', () => {
  const baseReq = {
    requestId: 'req-exec',
    files: [{path: 'src/app.ts', additions: 1, deletions: 0}],
    patchOperations: [{type: 'search_replace', search: 'hello', replace: 'world', occurrence: 'unique' as const}],
    approved: true,
  };

  it('requires approval for risky paths when not approved', async () => {
    const result = await executeDiffApplyRequest(
      {
        requestId: 'r1',
        files: [{path: '.env', additions: 1, deletions: 0}],
        approved: false,
      },
      '/tmp',
      vi.fn(),
    );
    expect(result.status).toBe('approval_required');
    expect(result.riskyPaths).toContain('.env');
  });

  it('requires approval for safe paths when not approved', async () => {
    const result = await executeDiffApplyRequest(
      {...baseReq, approved: false},
      '/tmp',
      vi.fn(),
    );
    expect(result.status).toBe('approval_required');
  });

  it('applies through mocked invoker when approved', async () => {
    const invoker = vi.fn().mockResolvedValue({
      ok: true,
      summary: 'Patched src/app.ts',
      output: 'src/app.ts',
      metadata: {filePath: 'src/app.ts'},
    });
    const result = await executeDiffApplyRequest(baseReq, '/ws', invoker);
    expect(result.status).toBe('applied');
    expect(result.changedFiles).toEqual(['src/app.ts']);
    expect(invoker).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'src/app.ts',
        operations: baseReq.patchOperations,
        dryRun: false,
      }),
      '/ws',
    );
  });

  it('returns unsupported for approved unified patch without structured ops', async () => {
    const invoker = vi.fn();
    const result = await executeDiffApplyRequest(
      {
        requestId: 'r-u',
        files: [{path: 'a.ts', additions: 1, deletions: 0}],
        patch: '--- a/foo\n+++ b/foo\n',
        approved: true,
      },
      '/ws',
      invoker,
    );
    expect(result.status).toBe('unsupported');
    expect(invoker).not.toHaveBeenCalled();
  });

  it('returns unsupported when multiple files with structured patch', async () => {
    const result = await executeDiffApplyRequest(
      {
        requestId: 'm',
        files: [
          {path: 'a.ts', additions: 1, deletions: 0},
          {path: 'b.ts', additions: 1, deletions: 0},
        ],
        patchOperations: [{type: 'search_replace', search: 'x', replace: 'y'}],
        approved: true,
      },
      '/ws',
      vi.fn(),
    );
    expect(result.status).toBe('unsupported');
  });

  it('returns denied when invoker returns ok false', async () => {
    const result = await executeDiffApplyRequest(
      baseReq,
      '/ws',
      vi.fn().mockResolvedValue({ok: false, summary: 'blocked', output: ''}),
    );
    expect(result.status).toBe('denied');
  });

  it('returns denied on permission AppError', async () => {
    const result = await executeDiffApplyRequest(
      baseReq,
      '/ws',
      vi.fn().mockRejectedValue(new AppError('no', 'APPROVAL_DENIED')),
    );
    expect(result.status).toBe('denied');
  });

  it('returns failed on other errors', async () => {
    const result = await executeDiffApplyRequest(
      baseReq,
      '/ws',
      vi.fn().mockRejectedValue(new Error('disk full')),
    );
    expect(result.status).toBe('failed');
  });
});

describe('formatDiffApplyResultPayload', () => {
  it('formats result to safe payload', () => {
    const payload = formatDiffApplyResultPayload({
      status: 'approval_required',
      message: 'Needs approval',
      riskyPaths: ['.env'],
      requestId: 'req-1',
    });
    expect(payload['status']).toBe('approval_required');
    expect(payload['message']).toBeTruthy();
    expect(Array.isArray(payload['riskyPaths'])).toBe(true);
  });

  it('truncates long messages', () => {
    const longMsg = 'x'.repeat(600);
    const payload = formatDiffApplyResultPayload({
      status: 'failed',
      message: longMsg,
      riskyPaths: [],
      requestId: 'req-x',
    });
    expect(String(payload['message']).length).toBeLessThanOrEqual(500);
  });

  it('caps risky paths list', () => {
    const paths = Array.from({length: 20}, (_, i) => `file${i}.env`);
    const payload = formatDiffApplyResultPayload({
      status: 'approval_required',
      message: 'many risky files',
      riskyPaths: paths,
      requestId: 'req-x',
    });
    expect((payload['riskyPaths'] as string[]).length).toBeLessThanOrEqual(10);
  });

  it('result payload does not contain secrets', () => {
    const payload = formatDiffApplyResultPayload({
      status: 'failed',
      message: 'token=sk-abc123456789012345678901234567890123456789 error',
      riskyPaths: [],
      requestId: 'req-s',
    });
    expect(JSON.stringify(payload)).not.toContain('sk-abc123456789012345678901234567890123456789');
  });
});
