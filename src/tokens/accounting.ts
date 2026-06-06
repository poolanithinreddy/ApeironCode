import {estimateTokens} from './estimate.js';
import {redactSecretLikeContent} from '../memory/safety.js';
import type {TokenBreakdown} from './types.js';

export interface TokenLedgerSavings {
  compression: number;
  context: number;
  memory: number;
  schema: number;
}

export interface TokenLedger {
  categories: {
    completion: number;
    context: number;
    conversation: number;
    memory: number;
    system: number;
    toolResults: number;
    toolSchemas: number;
    user: number;
  };
  savings: TokenLedgerSavings;
}

export interface TokenLedgerSummary {
  breakdown: TokenBreakdown;
  outputTokens: number;
  savings: TokenLedgerSavings;
  totalEstimatedInput: number;
  totalEstimatedOutput: number;
  totalEstimatedTokens: number;
}

const createEmptySavings = (): TokenLedgerSavings => ({
  compression: 0,
  context: 0,
  memory: 0,
  schema: 0,
});

const toTokenCount = (value: number | string): number =>
  typeof value === 'number' ? Math.max(0, Math.round(value)) : estimateTokens(value);

export const createTokenLedger = (): TokenLedger => ({
  categories: {
    completion: 0,
    context: 0,
    conversation: 0,
    memory: 0,
    system: 0,
    toolResults: 0,
    toolSchemas: 0,
    user: 0,
  },
  savings: createEmptySavings(),
});

export const recordPromptTokens = (ledger: TokenLedger, text: string): TokenLedger => {
  ledger.categories.system += estimateTokens(text);
  return ledger;
};

export const recordContextTokens = (
  ledger: TokenLedger,
  text: string,
  savings = 0,
): TokenLedger => {
  ledger.categories.context += estimateTokens(text);
  ledger.savings.context += Math.max(0, Math.round(savings));
  return ledger;
};

export const recordMemoryTokens = (
  ledger: TokenLedger,
  text: string,
  savings = 0,
): TokenLedger => {
  ledger.categories.memory += estimateTokens(text);
  ledger.savings.memory += Math.max(0, Math.round(savings));
  return ledger;
};

export const recordToolSchemaTokens = (
  ledger: TokenLedger,
  tokensOrText: number | string,
  savings = 0,
): TokenLedger => {
  ledger.categories.toolSchemas += toTokenCount(tokensOrText);
  ledger.savings.schema += Math.max(0, Math.round(savings));
  return ledger;
};

export const recordToolResultTokens = (
  ledger: TokenLedger,
  tokensOrText: number | string,
  savings = 0,
): TokenLedger => {
  ledger.categories.toolResults += toTokenCount(tokensOrText);
  ledger.savings.compression += Math.max(0, Math.round(savings));
  return ledger;
};

export const recordConversationTokens = (ledger: TokenLedger, text: string): TokenLedger => {
  ledger.categories.conversation += estimateTokens(text);
  return ledger;
};

export const recordCompletionTokens = (
  ledger: TokenLedger,
  tokensOrText: number | string,
): TokenLedger => {
  ledger.categories.completion += toTokenCount(tokensOrText);
  return ledger;
};

export const summarizeTokenLedger = (ledger: TokenLedger): TokenLedgerSummary => {
  const totalEstimatedInput = ledger.categories.system +
    ledger.categories.user +
    ledger.categories.conversation +
    ledger.categories.context +
    ledger.categories.memory +
    ledger.categories.toolSchemas +
    ledger.categories.toolResults;
  const totalEstimatedOutput = ledger.categories.completion;
  const breakdown: TokenBreakdown = {
    context: ledger.categories.context + ledger.categories.conversation,
    memory: ledger.categories.memory,
    output: ledger.categories.completion,
    system: ledger.categories.system,
    toolResults: ledger.categories.toolResults,
    tools: ledger.categories.toolSchemas,
    total: totalEstimatedInput + totalEstimatedOutput,
    unknown: 0,
    user: ledger.categories.user,
  };

  return {
    breakdown,
    outputTokens: totalEstimatedOutput,
    savings: {...ledger.savings},
    totalEstimatedInput,
    totalEstimatedOutput,
    totalEstimatedTokens: totalEstimatedInput + totalEstimatedOutput,
  };
};

export const formatTokenLedger = (ledger: TokenLedger): string => {
  const summary = summarizeTokenLedger(ledger);
  const lines = [
    `input=${summary.totalEstimatedInput}`,
    `output=${summary.totalEstimatedOutput}`,
    `total=${summary.totalEstimatedTokens}`,
    `system=${summary.breakdown.system}`,
    `user=${summary.breakdown.user}`,
    `conversation=${ledger.categories.conversation}`,
    `context=${ledger.categories.context}`,
    `memory=${ledger.categories.memory}`,
    `toolSchemas=${ledger.categories.toolSchemas}`,
    `toolResults=${ledger.categories.toolResults}`,
    `savings(compression=${summary.savings.compression},context=${summary.savings.context},memory=${summary.savings.memory},schema=${summary.savings.schema})`,
  ];
  return redactSecretLikeContent(lines.join(', '));
};
