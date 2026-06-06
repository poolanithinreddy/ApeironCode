export interface PatchLimits {
  maxChangedFiles?: number;
  maxDiffBytes?: number;
}

export interface PatchSummary {
  bytes: number;
  files: number;
}

export interface PatchOrchestrationOutcome {
  applied: boolean;
  reason?: string;
  status: 'applied' | 'rejected-too-many-files' | 'rejected-too-large' | 'rolled-back' | 'retry-exhausted';
  summary: PatchSummary;
}

export const DEFAULT_PATCH_LIMITS: Required<PatchLimits> = {
  maxChangedFiles: 50,
  maxDiffBytes: 200_000,
};

export const measurePatch = (filesChanged: string[], diff: string): PatchSummary => ({
  bytes: Buffer.byteLength(diff, 'utf8'),
  files: filesChanged.length,
});

export const enforcePatchLimits = (
  summary: PatchSummary,
  limits: PatchLimits = {},
): {ok: true} | {ok: false; reason: string; status: PatchOrchestrationOutcome['status']} => {
  const merged = {...DEFAULT_PATCH_LIMITS, ...limits};
  if (summary.files > merged.maxChangedFiles) {
    return {
      ok: false,
      reason: `Patch changes ${summary.files} files (limit ${merged.maxChangedFiles}); aborting.`,
      status: 'rejected-too-many-files',
    };
  }
  if (summary.bytes > merged.maxDiffBytes) {
    return {
      ok: false,
      reason: `Patch is ${summary.bytes} bytes (limit ${merged.maxDiffBytes}); aborting.`,
      status: 'rejected-too-large',
    };
  }
  return {ok: true};
};

export interface RetryOptions {
  isTransient?: (err: unknown) => boolean;
  maxAttempts?: number;
  onAttemptFailure?: (err: unknown, attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export const isTransientGitHubError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit|secondary rate|abuse detection/iu.test(message)) return true;
  if (/\b5\d\d\b/u.test(message)) return true;
  if (/ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENETUNREACH/u.test(message)) return true;
  return false;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const max = options.maxAttempts ?? 3;
  const isTransient = options.isTransient ?? isTransientGitHubError;
  const sleep = options.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      options.onAttemptFailure?.(err, attempt);
      if (!isTransient(err) || attempt === max) {
        throw err;
      }
      await sleep(Math.min(2 ** attempt * 100, 2_000));
    }
  }
  throw lastErr;
};

export interface CheckpointHandle {
  reason?: string;
  restored: boolean;
  state: unknown;
}

export interface CheckpointStore<S> {
  capture: () => Promise<S>;
  restore: (state: S) => Promise<void>;
}

export const withCheckpoint = async <S, R>(
  store: CheckpointStore<S>,
  body: () => Promise<R>,
): Promise<{checkpoint: CheckpointHandle; result?: R; error?: unknown}> => {
  const state = await store.capture();
  try {
    const result = await body();
    return {checkpoint: {restored: false, state}, result};
  } catch (error) {
    await store.restore(state).catch(() => undefined);
    return {checkpoint: {reason: error instanceof Error ? error.message : String(error), restored: true, state}, error};
  }
};

export const buildPatchCommitMessage = (input: {
  issueOrPrNumber?: number;
  ref: 'issue' | 'pr';
  summary?: string;
  workflow: string;
}): string => {
  const headline = `${input.workflow}: automated changes${input.summary ? ` — ${input.summary.slice(0, 60)}` : ''}`;
  const linkLine = input.issueOrPrNumber !== undefined
    ? `\n\nRelates to ${input.ref === 'pr' ? 'PR' : 'issue'} #${input.issueOrPrNumber}.`
    : '';
  return `${headline}${linkLine}\n\nSigned-off-by: apeironcode-agent`;
};

export const buildSafeFailureComment = (input: {
  reason: string;
  workflow: string;
}): string => [
  `### ApeironCode automation could not complete \`${input.workflow}\``,
  '',
  input.reason,
  '',
  '_No changes were committed. Please review and rerun manually if appropriate._',
].join('\n');
