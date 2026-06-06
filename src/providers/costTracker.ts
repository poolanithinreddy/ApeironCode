import type {ProviderUsage} from './types.js';

export interface UsageBreakdownEntry {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  breakdown?: UsageBreakdownEntry[];
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  breakdown: UsageBreakdownEntry[];
}

export const formatCost = (costUsd: number | undefined): string => {
  if (!costUsd || costUsd === 0) {
    return 'free';
  }
  if (costUsd < 0.01) {
    return `< $0.01`;
  }
  return `$${costUsd.toFixed(4)}`;
};

export const formatTokens = (count: number): string => {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
};

export const summarizeUsageSnapshots = (
  snapshots: Array<UsageSnapshot | undefined>,
): CostSummary => {
  const grouped = new Map<string, UsageBreakdownEntry>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCostUsd = 0;

  for (const snapshot of snapshots) {
    if (!snapshot) {
      continue;
    }

    const breakdown = snapshot.breakdown ?? [];
    totalInputTokens += snapshot.inputTokens
      ?? breakdown.reduce((sum, entry) => sum + entry.inputTokens, 0);
    totalOutputTokens += snapshot.outputTokens
      ?? breakdown.reduce((sum, entry) => sum + entry.outputTokens, 0);
    totalEstimatedCostUsd += snapshot.estimatedCostUsd
      ?? breakdown.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);

    for (const entry of breakdown) {
      const key = `${entry.provider}:${entry.model}`;
      const existing = grouped.get(key) ?? {
        provider: entry.provider,
        model: entry.model,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      };

      existing.calls += entry.calls;
      existing.inputTokens += entry.inputTokens;
      existing.outputTokens += entry.outputTokens;
      existing.estimatedCostUsd += entry.estimatedCostUsd;

      grouped.set(key, existing);
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCostUsd,
    breakdown: Array.from(grouped.values()).sort(
      (left, right) => right.estimatedCostUsd - left.estimatedCostUsd || right.calls - left.calls,
    ),
  };
};

export class CostTracker {
  private calls: Array<{
    provider: string;
    model: string;
    usage?: ProviderUsage;
  }> = [];

  addCall(provider: string, model: string, usage?: ProviderUsage): void {
    this.calls.push({provider, model, usage});
  }

  getSummary(): CostSummary {
    return summarizeUsageSnapshots(this.calls.map((call) => ({
      breakdown: [
        {
          provider: call.provider,
          model: call.model,
          calls: 1,
          inputTokens: call.usage?.inputTokens ?? 0,
          outputTokens: call.usage?.outputTokens ?? 0,
          estimatedCostUsd: call.usage?.estimatedCostUsd ?? 0,
        },
      ],
      estimatedCostUsd: call.usage?.estimatedCostUsd ?? 0,
      inputTokens: call.usage?.inputTokens ?? 0,
      outputTokens: call.usage?.outputTokens ?? 0,
      totalTokens: (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0),
    })));
  }

  formatSummary(): string {
    const summary = this.getSummary();

    if (this.calls.length === 0) {
      return 'No API calls tracked.';
    }

    const lines = [
      `## Usage Summary (${this.calls.length} call${this.calls.length === 1 ? '' : 's'})`,
      '',
      `**Total Cost:** ${formatCost(summary.totalEstimatedCostUsd)}`,
      `**Input Tokens:** ${formatTokens(summary.totalInputTokens)}`,
      `**Output Tokens:** ${formatTokens(summary.totalOutputTokens)}`,
      '',
    ];

    if (summary.breakdown.length > 1) {
      lines.push('### Breakdown by Model');
      for (const item of summary.breakdown) {
        lines.push(`- **${item.provider}/${item.model}** (${item.calls} calls)`);
        lines.push(`  - Input: ${formatTokens(item.inputTokens)}`);
        lines.push(`  - Output: ${formatTokens(item.outputTokens)}`);
        lines.push(`  - Cost: ${formatCost(item.estimatedCostUsd)}`);
      }
    }

    return lines.join('\n');
  }
}
