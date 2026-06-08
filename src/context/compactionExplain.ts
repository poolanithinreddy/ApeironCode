export interface CompactionExplanation {
  preservedItems: string[];
  summarizedItems: string[];
  omittedItems: string[];
  reason: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  warnings: string[];
}

export const explainContextCompaction = (
  before: {items: string[]; tokens: number},
  after: {items: string[]; tokens: number},
  reason: string,
): CompactionExplanation => {
  const omitted = before.items.filter((i) => !after.items.includes(i));
  const preserved = after.items.filter((i) => before.items.includes(i));
  const summarized = after.items.filter(
    (i) => !before.items.includes(i) && i.startsWith('summary:'),
  );

  return {
    preservedItems: preserved,
    summarizedItems: summarized,
    omittedItems: omitted,
    reason,
    tokensBefore: before.tokens,
    tokensAfter: after.tokens,
    tokensSaved: Math.max(0, before.tokens - after.tokens),
    warnings: omitted.length > 0 ? [`${omitted.length} items omitted from context.`] : [],
  };
};

export const formatCompactionExplanation = (explanation: CompactionExplanation): string => {
  const lines = [
    `Context compaction: ${explanation.reason}`,
    `Tokens: ${explanation.tokensBefore} → ${explanation.tokensAfter} (saved ${explanation.tokensSaved})`,
    `Preserved: ${explanation.preservedItems.length} items`,
    `Summarized: ${explanation.summarizedItems.length} items`,
    `Omitted: ${explanation.omittedItems.length} items`,
  ];
  if (explanation.warnings.length) {
    for (const w of explanation.warnings) lines.push(`Warning: ${w}`);
  }
  return lines.join('\n');
};
