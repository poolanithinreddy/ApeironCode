import type {MemoryGraph, MemoryRelatedResult} from './graphTypes.js';

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9_./-]+/u).filter((token) => token.length > 1);

export const searchMemoryGraph = (
  graph: MemoryGraph,
  query: string,
  limit = 8,
): MemoryRelatedResult[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const results = graph.entities.map((entity) => {
    const haystack = [
      entity.name,
      entity.type,
      ...entity.tags,
      ...entity.observations,
      JSON.stringify(entity.metadata ?? {}),
    ].join(' ');
    const textTokens = new Set(tokenize(haystack));
    const matched = queryTokens.filter((token) => textTokens.has(token) || haystack.toLowerCase().includes(token));
    const edges = graph.edges.filter((edge) => edge.from === entity.id || edge.to === entity.id);
    return {
      edges,
      entity,
      reasons: matched.map((token) => `matched "${token}"`),
      score: matched.length * 10 + Math.min(edges.length, 5) + entity.confidence,
    };
  });

  return results
    .filter((result) => result.score > 0 && !result.entity.stale)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

export const explainMemorySelection = (results: MemoryRelatedResult[]): string => {
  if (results.length === 0) {
    return 'No graph memories matched this query.';
  }

  return results
    .map((result, index) => `${index + 1}. ${result.entity.name} (${result.entity.type}) score=${result.score.toFixed(1)} because ${result.reasons.join(', ') || 'it is connected'}`)
    .join('\n');
};
