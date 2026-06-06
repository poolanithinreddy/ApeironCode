import type {FileSummary} from './fileSummaries.js';
import {estimateTokens} from './tokenBudget.js';

export interface PackedContext {
  omitted: string[];
  selected: FileSummary[];
  tokenEstimate: number;
}

export const packContext = (summaries: FileSummary[], budget: number): PackedContext => {
  const selected: FileSummary[] = [];
  const omitted: string[] = [];
  let tokenEstimate = 0;

  for (const summary of summaries) {
    const cost = estimateTokens(summary.summary);
    if (tokenEstimate + cost <= budget) {
      selected.push(summary);
      tokenEstimate += cost;
    } else {
      omitted.push(summary.path);
    }
  }

  return {omitted, selected, tokenEstimate};
};

export const formatPackedContext = (packed: PackedContext): string => [
  `Selected files: ${packed.selected.length}`,
  `Estimated tokens: ${packed.tokenEstimate}`,
  packed.selected.map((summary) => `- ${summary.path}`).join('\n'),
  packed.omitted.length > 0 ? `Omitted: ${packed.omitted.join(', ')}` : 'Omitted: none',
].filter(Boolean).join('\n');
