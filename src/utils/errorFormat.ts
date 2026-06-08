import {redactLogValue} from './structuredLogger.js';

export type ErrorCategory = 'auth' | 'config' | 'memory' | 'network' | 'provider' | 'sandbox' | 'tool' | 'unknown';

export const redactError = (error: unknown): string =>
  redactLogValue(error instanceof Error ? error.message : String(error)) as string;

export const classifyError = (error: unknown): ErrorCategory => {
  const text = redactError(error).toLowerCase();
  if (/api key|unauthorized|forbidden|credential|auth/u.test(text)) return 'auth';
  if (/config|json|setting|missing.*env/u.test(text)) return 'config';
  if (/econn|network|dns|fetch|timeout|socket/u.test(text)) return 'network';
  if (/provider|model|rate limit|quota/u.test(text)) return 'provider';
  if (/tool|schema|zod|invalid input/u.test(text)) return 'tool';
  if (/sandbox|docker|podman|firejail|permission denied/u.test(text)) return 'sandbox';
  if (/memory|index|graph/u.test(text)) return 'memory';
  return 'unknown';
};

export const formatUserError = (error: unknown): string => {
  const category = classifyError(error);
  const message = redactError(error);
  const hint = category === 'auth'
    ? 'Check the required environment variable or provider setup.'
    : category === 'config'
      ? 'Check your ApeironCode config and rerun `apeironcode doctor`.'
      : category === 'sandbox'
        ? 'Check sandbox backend availability or fallback settings.'
        : undefined;
  return [`${category.toUpperCase()}: ${message}`, hint].filter(Boolean).join('\n');
};

export const formatDebugError = (error: unknown): string => {
  if (error instanceof Error) {
    return redactLogValue([error.name, error.message, error.stack].filter(Boolean).join('\n')) as string;
  }
  return redactError(error);
};
