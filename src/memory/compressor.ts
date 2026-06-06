import {estimateTokens} from '../tokens/estimate.js';
import {redactSecretLikeContent} from './safety.js';

export interface MemoryFactLike {
  type?: string;
  name?: string;
  summary?: string;
  observations?: string[];
  confidence?: number;
  stale?: boolean;
  source?: string;
}

export interface CompressedMemoryContext {
  bullets: string[];
  omittedCount: number;
  tokenEstimate: number;
  warnings: string[];
  sources: string[];
}

export interface MemoryCompressionOptions {
  maxTokens: number;
  prompt?: string;
  includeMetadata?: boolean;
}

const prefixFor = (fact: MemoryFactLike): string => {
  if (fact.type?.includes('decision') || fact.type === 'architecture_decision') return 'Decision';
  if (fact.type === 'convention' || fact.type === 'user_preference') return 'Constraint';
  if (fact.type === 'error' || fact.type === 'bug') return 'Risk';
  if (fact.type === 'file' || fact.type === 'module') return 'Related files';
  return 'Decision';
};

const factText = (fact: MemoryFactLike): string =>
  redactSecretLikeContent([
    fact.name,
    fact.summary,
    ...(fact.observations ?? []),
  ].filter(Boolean).join(' - ')).replace(/\s+/gu, ' ').trim();

export const dedupeMemoryFacts = (facts: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const fact of facts) {
    const normalized = fact.toLowerCase().replace(/\W+/gu, ' ').trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(fact);
    }
  }
  return result;
};

export const compressRelevantMemory = (
  memories: MemoryFactLike[],
  options: MemoryCompressionOptions,
): CompressedMemoryContext => {
  const warnings: string[] = [];
  const sources = new Set<string>();
  const candidates = memories
    .filter((memory) => (memory.confidence ?? 0.8) >= 0.45)
    .sort((left, right) => (right.confidence ?? 0.8) - (left.confidence ?? 0.8));
  const bullets: string[] = [];
  let usedTokens = 0;
  let omittedCount = 0;

  for (const memory of candidates) {
    if (memory.stale && (memory.confidence ?? 0) < 0.85) {
      omittedCount += 1;
      warnings.push(`Omitted stale lower-confidence memory: ${memory.name ?? 'unnamed'}`);
      continue;
    }
    const text = factText(memory);
    if (!text) {
      continue;
    }
    const metadata = options.includeMetadata && memory.confidence !== undefined
      ? ` (confidence=${memory.confidence.toFixed(2)}${memory.source ? `; source=${memory.source}` : ''})`
      : '';
    const bullet = `${prefixFor(memory)}: ${text}${metadata}`;
    const tokenEstimate = estimateTokens(bullet);
    if (usedTokens + tokenEstimate > options.maxTokens) {
      omittedCount += 1;
      continue;
    }
    bullets.push(bullet);
    usedTokens += tokenEstimate;
    if (memory.source) {
      sources.add(memory.source);
    }
  }

  const deduped = dedupeMemoryFacts(bullets);
  return {
    bullets: deduped,
    omittedCount: omittedCount + bullets.length - deduped.length,
    sources: Array.from(sources).sort(),
    tokenEstimate: deduped.reduce((sum, bullet) => sum + estimateTokens(bullet), 0),
    warnings: Array.from(new Set(warnings)),
  };
};

export const formatCompressedMemory = (context: CompressedMemoryContext): string => {
  if (context.bullets.length === 0) {
    return 'Relevant memory: none selected.';
  }
  return [
    'Relevant memory:',
    ...context.bullets.map((bullet) => `- ${bullet}`),
    context.omittedCount > 0 ? `- Omitted ${context.omittedCount} lower-priority memory fact(s).` : '',
  ].filter(Boolean).join('\n');
};
