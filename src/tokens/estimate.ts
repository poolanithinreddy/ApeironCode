import type {TokenBreakdown, TokenEstimateOptions} from './types.js';

const DEFAULT_CHARS_PER_TOKEN = 4;

const codeDensityAdjustment = (text: string): number => {
  const codeChars = (text.match(/[{}()[\];=<>]/gu) ?? []).length;
  const newlineCount = (text.match(/\n/gu) ?? []).length;
  const ratio = (codeChars + newlineCount) / Math.max(1, text.length);
  if (ratio > 0.12) {
    return 0.78;
  }
  if (ratio > 0.06) {
    return 0.88;
  }
  return 1;
};

export const estimateTokens = (text: string, options: TokenEstimateOptions = {}): number => {
  if (!text.trim()) {
    return 0;
  }
  const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const compacted = text.replace(/\s+/gu, ' ').trim();
  const longLinePenalty = text.split(/\r?\n/u).some((line) => line.length > 240) ? 1.12 : 1;
  const adjustedCharsPerToken = Math.max(1.5, charsPerToken * codeDensityAdjustment(text));
  return Math.max(1, Math.ceil(compacted.length / adjustedCharsPerToken * longLinePenalty));
};

export const estimateObjectTokens = (value: unknown, options: TokenEstimateOptions = {}): number => {
  if (value === undefined || value === null) {
    return 0;
  }
  return estimateTokens(typeof value === 'string' ? value : JSON.stringify(value, null, 2), options);
};

export const createEmptyTokenBreakdown = (): TokenBreakdown => ({
  context: 0,
  memory: 0,
  output: 0,
  system: 0,
  toolResults: 0,
  tools: 0,
  total: 0,
  unknown: 0,
  user: 0,
});

export const addTokenBreakdown = (left: TokenBreakdown, right: TokenBreakdown): TokenBreakdown => {
  const result = createEmptyTokenBreakdown();
  for (const key of Object.keys(result) as Array<keyof TokenBreakdown>) {
    result[key] = left[key] + right[key];
  }
  result.total = result.system + result.user + result.context + result.memory + result.tools +
    result.toolResults + result.output + result.unknown;
  return result;
};

export const formatTokenBreakdown = (breakdown: TokenBreakdown): string => [
  `total=${breakdown.total}`,
  `system=${breakdown.system}`,
  `user=${breakdown.user}`,
  `context=${breakdown.context}`,
  `memory=${breakdown.memory}`,
  `tools=${breakdown.tools}`,
  `toolResults=${breakdown.toolResults}`,
  `output=${breakdown.output}`,
  `unknown=${breakdown.unknown}`,
].join(', ');
