import type {ProviderUsage} from './types.js';
import {findCatalogEntry} from './modelCatalog.js';

export const estimateUsageCost = (
  providerName: string,
  model: string,
  usage?: ProviderUsage,
): ProviderUsage | undefined => {
  if (!usage || usage.estimatedCostUsd !== undefined) {
    return usage;
  }

  const catalogEntry = findCatalogEntry(providerName, model);
  if (!catalogEntry) {
    return usage;
  }

  const inputCost = catalogEntry.inputCostPer1kTokens ?? 0;
  const outputCost = catalogEntry.outputCostPer1kTokens ?? 0;
  const estimatedCostUsd =
    ((usage.inputTokens ?? 0) / 1_000) * inputCost
    + ((usage.outputTokens ?? 0) / 1_000) * outputCost;

  return {
    ...usage,
    estimatedCostUsd,
  };
};