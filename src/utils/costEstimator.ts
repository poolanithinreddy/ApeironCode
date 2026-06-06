import type {TokenBreakdown} from '../tokens/types.js';
import type {ProviderUsage} from '../providers/types.js';
import {findCatalogEntry} from '../providers/modelCatalog.js';
import {formatCost, formatTokens} from '../providers/costTracker.js';

export interface ModelPricing {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
}

export interface CostEstimate {
  estimatedCostUsd: number | null;
  inputTokens: number;
  model: string;
  notes?: string[];
  outputTokens: number;
  providerId: string;
  tokenBreakdown?: Partial<TokenBreakdown>;
}

export const getModelPricing = (providerId: string, model: string): ModelPricing | null => {
  const entry = findCatalogEntry(providerId, model);
  if (!entry || entry.inputCostPer1kTokens === undefined || entry.outputCostPer1kTokens === undefined) {
    return null;
  }
  return {
    inputCostPer1kTokens: entry.inputCostPer1kTokens,
    outputCostPer1kTokens: entry.outputCostPer1kTokens,
  };
};

export const estimateCost = (
  providerId: string,
  model: string,
  usage: ProviderUsage & {tokenBreakdown?: Partial<TokenBreakdown>},
): CostEstimate => {
  const inputTokens = usage.inputTokens ?? usage.totalTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const pricing = getModelPricing(providerId, model);
  if (!pricing) {
    return {estimatedCostUsd: null, inputTokens, model, notes: ['Pricing unavailable in local model catalog.'], outputTokens, providerId, tokenBreakdown: usage.tokenBreakdown};
  }
  return {
    estimatedCostUsd: inputTokens / 1000 * pricing.inputCostPer1kTokens + outputTokens / 1000 * pricing.outputCostPer1kTokens,
    inputTokens,
    model,
    outputTokens,
    providerId,
    tokenBreakdown: usage.tokenBreakdown,
  };
};

export const formatCostEstimate = (estimate: CostEstimate): string => {
  const lines = [
    `${estimate.providerId}/${estimate.model}`,
    `Input: ${formatTokens(estimate.inputTokens)}`,
    `Output: ${formatTokens(estimate.outputTokens)}`,
    `Estimated cost: ${estimate.estimatedCostUsd === null ? 'unknown' : formatCost(estimate.estimatedCostUsd)}`,
  ];
  if (estimate.tokenBreakdown) {
    lines.push(`Breakdown: context=${formatTokens(estimate.tokenBreakdown.context ?? 0)}, memory=${formatTokens(estimate.tokenBreakdown.memory ?? 0)}, tools=${formatTokens(estimate.tokenBreakdown.tools ?? 0)}, toolResults=${formatTokens(estimate.tokenBreakdown.toolResults ?? 0)}, output=${formatTokens(estimate.tokenBreakdown.output ?? 0)}`);
  }
  if (estimate.notes?.length) {
    lines.push(`Notes: ${estimate.notes.join('; ')}`);
  }
  return lines.join('\n');
};
