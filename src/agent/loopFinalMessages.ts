import crypto from 'node:crypto';

import type {OverallProgress} from './loopProgress.js';
import type {ChatMessage} from './types.js';

/**
 * Pure factory helpers for the assistant's terminal messages emitted by the
 * agent loop. Extracted from loop.ts to keep the loop body lean.
 */

const nowIso = (): string => new Date().toISOString();

export const createStalledFinalMessage = (
  progress: OverallProgress,
  fallbackReason: string,
): ChatMessage => {
  const reason = progress.stalledReason ?? fallbackReason;
  const tools =
    progress.uniqueToolsCalled.length > 0 ? progress.uniqueToolsCalled.join(', ') : 'none';
  return {
    content: [
      'I paused because the agent loop stopped making meaningful progress.',
      `Reason: ${reason}`,
      `Last useful progress was iteration ${progress.lastMeaningfulProgressIteration || 'none'}.`,
      `Tools tried recently: ${tools}.`,
      'A clearer target file, expected output, or permission to try a different approach may be needed.',
    ].join('\n'),
    createdAt: nowIso(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
};

export const createConsecutiveErrorsMessage = (
  consecutiveErrors: number,
  lastErrorMessage: string,
): ChatMessage => ({
  content: `I stopped after ${consecutiveErrors} consecutive errors. Last error: ${lastErrorMessage}`,
  createdAt: nowIso(),
  id: crypto.randomUUID(),
  role: 'assistant',
});

export const createConsecutiveToolFailuresMessage = (
  consecutiveErrors: number,
  lastErrorMessage: string,
): ChatMessage => ({
  content: `I stopped after ${consecutiveErrors} consecutive tool failures. Last error: ${lastErrorMessage}`,
  createdAt: nowIso(),
  id: crypto.randomUUID(),
  role: 'assistant',
});

/**
 * Clean, user-facing terminal message for a provider authentication failure.
 * No retries, no stack trace, no memory prompt — just the actionable error
 * (which already carries the fix steps from the provider layer).
 */
export const createAuthFailureMessage = (
  authErrorMessage: string,
  id: string = crypto.randomUUID(),
): ChatMessage => ({
  content: authErrorMessage.trim(),
  createdAt: nowIso(),
  id,
  role: 'assistant',
});

export const createMaxIterationsMessage = (
  iterationBudget: number,
  budgetReason: string,
): ChatMessage => ({
  content: `Reached maximum iterations (${iterationBudget}). Please continue from the current state. ${budgetReason}`,
  createdAt: nowIso(),
  id: crypto.randomUUID(),
  role: 'assistant',
});
