const DEFAULT_CHARS_PER_TOKEN = 4;

export interface TokenUsageEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const estimateTokens = (value: string): number => {
  return Math.max(1, Math.ceil(value.length / DEFAULT_CHARS_PER_TOKEN));
};

export const estimateUsage = (
  input: string,
  output: string,
): TokenUsageEstimate => {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
};