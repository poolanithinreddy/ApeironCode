export interface ContextBudget {
  maxBytes: number;
  maxFiles: number;
  maxTokens: number;
}

export interface BudgetableContextEntry {
  estimatedTokens: number;
  path: string;
  size: number;
}

export const estimateTokensFromBytes = (bytes: number): number => Math.max(1, Math.ceil(bytes / 4));

export const applyContextBudget = <T extends BudgetableContextEntry>(
  entries: T[],
  budget: ContextBudget,
): T[] => {
  const selected: T[] = [];
  let usedBytes = 0;
  let usedTokens = 0;

  for (const entry of entries) {
    if (selected.length >= budget.maxFiles) {
      break;
    }

    if (usedBytes + entry.size > budget.maxBytes) {
      continue;
    }

    if (usedTokens + entry.estimatedTokens > budget.maxTokens) {
      continue;
    }

    selected.push(entry);
    usedBytes += entry.size;
    usedTokens += entry.estimatedTokens;
  }

  return selected;
};