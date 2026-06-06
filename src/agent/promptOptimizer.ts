import {estimateTokens} from '../tokens/estimate.js';
import {redactSecretLikeContent} from '../memory/safety.js';

export interface PromptSegment {
  id: string;
  type: 'system' | 'task' | 'context' | 'memory' | 'tools' | 'history' | 'safety';
  content: string;
  priority: number;
  required?: boolean;
}

export interface OptimizedPrompt {
  segments: PromptSegment[];
  tokenEstimate: number;
  omittedSegments: Array<{id: string; reason: string}>;
  explanation: string;
}

export interface PromptOptimizationReport {
  originalTokens: number;
  optimizedTokens: number;
  omittedSegments: Array<{id: string; reason: string}>;
  removedDuplicates: number;
  trimmedOptional: number;
}

export const dedupePromptSegments = (segments: PromptSegment[]): PromptSegment[] => {
  const seen = new Set<string>();
  const result: PromptSegment[] = [];
  for (const segment of segments) {
    const key = `${segment.type}:${segment.content.trim().toLowerCase().replace(/\s+/gu, ' ')}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(segment);
    }
  }
  return result;
};

const normalizeContent = (content: string): string =>
  content.trim().toLowerCase().replace(/\s+/gu, ' ');

export const enforcePromptBudget = (segments: PromptSegment[], maxTokens: number): PromptSegment[] => {
  const required = segments.filter((segment) => segment.required);
  const optional = segments.filter((segment) => !segment.required).sort((a, b) => b.priority - a.priority);
  const selected: PromptSegment[] = [...required];
  let used = required.reduce((sum, segment) => sum + estimateTokens(segment.content), 0);
  for (const segment of optional) {
    const tokens = estimateTokens(segment.content);
    if (used + tokens <= maxTokens) {
      selected.push(segment);
      used += tokens;
    }
  }
  const order = new Map(segments.map((segment, index) => [segment.id, index]));
  return selected.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
};

const sortOptionalSegments = (segments: PromptSegment[]): PromptSegment[] =>
  [...segments].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    return estimateTokens(left.content) - estimateTokens(right.content);
  });

export const optimizePromptSegments = (
  segments: PromptSegment[],
  options: {maxTokens: number},
): OptimizedPrompt => {
  const deduped = dedupePromptSegments(segments);
  const selected = enforcePromptBudget(deduped, options.maxTokens);
  const selectedIds = new Set(selected.map((segment) => segment.id));
  const omittedSegments = segments
    .filter((segment) => !selectedIds.has(segment.id))
    .map((segment) => ({id: segment.id, reason: deduped.includes(segment) ? 'over prompt budget' : 'duplicate content'}));
  const tokenEstimate = selected.reduce((sum, segment) => sum + estimateTokens(segment.content), 0);
  return {
    explanation: `Selected ${selected.length}/${segments.length} prompt segments within ${options.maxTokens} estimated tokens.`,
    omittedSegments,
    segments: selected,
    tokenEstimate,
  };
};

export const optimizePromptSegmentsV2 = (
  segments: PromptSegment[],
  budget: {maxTokens: number},
): OptimizedPrompt & {report: PromptOptimizationReport} => {
  const seen = new Set<string>();
  const selected: PromptSegment[] = [];
  const omitted: Array<{id: string; reason: string}> = [];
  let removedDuplicates = 0;

  for (const segment of segments) {
    const dedupeKey = `${segment.type}:${normalizeContent(segment.content)}`;
    if (seen.has(dedupeKey)) {
      omitted.push({id: segment.id, reason: 'duplicate content'});
      removedDuplicates += 1;
      continue;
    }
    seen.add(dedupeKey);
    selected.push(segment);
  }

  const required = selected.filter((segment) => segment.required || segment.type === 'safety' || segment.type === 'system');
  const optional = sortOptionalSegments(selected.filter((segment) => !required.includes(segment)));
  const kept = [...required];
  let usedTokens = required.reduce((sum, segment) => sum + estimateTokens(segment.content), 0);
  let trimmedOptional = 0;

  for (const segment of optional) {
    const tokens = estimateTokens(segment.content);
    if (usedTokens + tokens <= budget.maxTokens) {
      kept.push(segment);
      usedTokens += tokens;
      continue;
    }
    omitted.push({id: segment.id, reason: 'trimmed optional segment for token budget'});
    trimmedOptional += 1;
  }

  const order = new Map(segments.map((segment, index) => [segment.id, index]));
  const ordered = kept.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  const originalTokens = segments.reduce((sum, segment) => sum + estimateTokens(segment.content), 0);
  const optimizedTokens = ordered.reduce((sum, segment) => sum + estimateTokens(segment.content), 0);

  return {
    explanation: `Optimized ${ordered.length}/${segments.length} prompt segments within ${budget.maxTokens} estimated tokens.`,
    omittedSegments: omitted,
    report: {
      omittedSegments: omitted,
      optimizedTokens,
      originalTokens,
      removedDuplicates,
      trimmedOptional,
    },
    segments: ordered,
    tokenEstimate: optimizedTokens,
  };
};

export const formatPromptOptimizationReport = (report: PromptOptimizationReport): string =>
  redactSecretLikeContent(
    `prompt: original=${report.originalTokens}, optimized=${report.optimizedTokens}, ` +
    `saved=${Math.max(0, report.originalTokens - report.optimizedTokens)}, ` +
    `duplicates=${report.removedDuplicates}, trimmed=${report.trimmedOptional}`,
  );
