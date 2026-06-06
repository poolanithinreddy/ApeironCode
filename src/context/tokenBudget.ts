export interface TokenBudgetReport {
  budget: number;
  estimatedTokens: number;
  overBudget: boolean;
  savingsEstimate: number;
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const buildTokenBudgetReport = (texts: string[], budget: number): TokenBudgetReport => {
  const estimatedTokens = texts.reduce((sum, text) => sum + estimateTokens(text), 0);
  const naiveTokens = Math.max(estimatedTokens, texts.join('\n\n').length / 3);
  return {
    budget,
    estimatedTokens,
    overBudget: estimatedTokens > budget,
    savingsEstimate: Math.max(0, Math.ceil(naiveTokens - estimatedTokens)),
  };
};

export const formatTokenBudgetReport = (report: TokenBudgetReport): string => [
  `Token budget: ${report.budget}`,
  `Estimated selected tokens: ${report.estimatedTokens}`,
  `Status: ${report.overBudget ? 'over budget' : 'within budget'}`,
  `Estimated tokens saved: ${report.savingsEstimate}`,
].join('\n');
