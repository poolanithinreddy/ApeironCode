import crypto from 'node:crypto';

import {estimateTokens} from '../tokens/estimate.js';
import {redactSecretLikeContent} from '../memory/safety.js';

export interface ContextDeltaSnapshot {
  files: string[];
  fingerprint: string;
  mode?: string;
  promptContext: string;
}

export interface ContextDelta {
  changedFiles: string[];
  fullContext: string;
  nextFingerprint: string;
  previousFingerprint?: string;
  reason: string;
  removedFiles: string[];
  tokenSavings: number;
  unchanged: boolean;
  useFullContext: boolean;
}

const filePathPattern = /^FILE(?::| SUMMARY:)\s+(.+)$/u;

const extractFiles = (promptContext: string): string[] =>
  Array.from(new Set(
    promptContext
      .split(/\r?\n/u)
      .map((line) => filePathPattern.exec(line)?.[1]?.trim())
      .filter((value): value is string => Boolean(value)),
  ));

export const computeContextFingerprint = (
  contextBundle: Pick<ContextDeltaSnapshot, 'files' | 'mode' | 'promptContext'>,
): string => crypto
  .createHash('sha1')
  .update(JSON.stringify({
    files: [...contextBundle.files].sort(),
    mode: contextBundle.mode ?? 'default',
    promptContext: redactSecretLikeContent(contextBundle.promptContext),
  }))
  .digest('hex');

export const computeContextDelta = (
  previousContext: ContextDeltaSnapshot | null | undefined,
  nextContext: Pick<ContextDeltaSnapshot, 'files' | 'mode' | 'promptContext'>,
): ContextDelta => {
  const nextFingerprint = computeContextFingerprint(nextContext);
  const previousFingerprint = previousContext?.fingerprint;
  const nextFiles = nextContext.files.length > 0 ? nextContext.files : extractFiles(nextContext.promptContext);
  const previousFiles = previousContext?.files ?? [];
  const changedFiles = nextFiles.filter((file) => !previousFiles.includes(file));
  const removedFiles = previousFiles.filter((file) => !nextFiles.includes(file));
  const identical = previousFingerprint === nextFingerprint;
  const modeChanged = previousContext?.mode && previousContext.mode !== nextContext.mode;
  const explicitFileCount = nextFiles.length;
  const useFullContext = identical
    ? false
    : modeChanged || explicitFileCount <= 2 || nextContext.promptContext.length <= 2_000;

  const fullTokens = estimateTokens(nextContext.promptContext);
  const deltaText = identical
    ? 'Context unchanged from previous turn.'
    : [
        `Context delta (${nextContext.mode ?? 'default'}):`,
        changedFiles.length > 0 ? `Changed or new files: ${changedFiles.join(', ')}` : 'Changed or new files: none',
        removedFiles.length > 0 ? `Removed files: ${removedFiles.join(', ')}` : '',
        'Reuse prior selected context for unchanged files.',
      ].filter(Boolean).join('\n');

  return {
    changedFiles,
    fullContext: nextContext.promptContext,
    nextFingerprint,
    previousFingerprint,
    reason: identical
      ? 'Context fingerprint unchanged.'
      : modeChanged
        ? 'Mode changed; sending full context is safer.'
        : useFullContext
          ? 'Context is small enough that full resend is acceptable.'
          : 'Context delta is sufficient for this turn.',
    removedFiles,
    tokenSavings: Math.max(0, fullTokens - estimateTokens(deltaText)),
    unchanged: identical,
    useFullContext,
  };
};

export const formatContextDeltaForPrompt = (delta: ContextDelta): string => {
  if (delta.unchanged) {
    return 'Context unchanged from previous turn.';
  }
  if (delta.useFullContext) {
    return delta.fullContext;
  }
  return redactSecretLikeContent([
    'Context delta:',
    delta.changedFiles.length > 0 ? `- Changed/new files: ${delta.changedFiles.join(', ')}` : '- Changed/new files: none',
    delta.removedFiles.length > 0 ? `- Removed files: ${delta.removedFiles.join(', ')}` : '',
    '- Unchanged context from the prior turn can be treated as still in scope.',
  ].filter(Boolean).join('\n'));
};

export const shouldUseFullContext = (delta: ContextDelta, mode?: string): boolean =>
  delta.useFullContext || mode === 'review' || mode === 'debug';
