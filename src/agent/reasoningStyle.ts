import type {AgentMode} from './types.js';

export type ReasoningStyle = 'fast' | 'balanced' | 'deep';

export interface ReasoningContextSignals {
  fileCount?: number;
  hasErrors?: boolean;
  largeContext?: boolean;
}

export const chooseReasoningStyle = (
  prompt: string,
  mode?: AgentMode,
  contextSignals: ReasoningContextSignals = {},
): ReasoningStyle => {
  const lower = prompt.toLowerCase();
  if (contextSignals.largeContext || /architecture|migration|large refactor|design|complex|deep|tradeoff/u.test(lower)) {
    return 'deep';
  }
  if (mode === 'debug' || contextSignals.hasErrors || /debug|race condition|flaky|root cause/u.test(lower)) {
    return 'deep';
  }
  if (mode === 'explain' || /^(read|show|summari[sz]e|explain)\b/u.test(lower) || (mode === 'chat' && prompt.trim().split(/\s+/u).length <= 8)) {
    return 'fast';
  }
  return 'balanced';
};

export const formatReasoningInstruction = (style: ReasoningStyle): string => {
  switch (style) {
    case 'fast':
      return 'Response style: fast. Be concise, avoid repeated summaries, and use the smallest useful tool set.';
    case 'deep':
      return 'Response style: deep. Use careful planning for architecture/debugging, but keep final answers concise and do not reveal hidden chain-of-thought.';
    case 'balanced':
      return 'Response style: balanced. Use a brief plan when useful, then act directly and summarize only what matters.';
  }
};
