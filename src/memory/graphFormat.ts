import type {MemoryGraph, MemoryRelatedResult, MemoryReviewFinding} from './graphTypes.js';

export const formatMemoryGraphSummary = (graph: MemoryGraph): string => {
  const entityCounts = new Map<string, number>();
  const edgeCounts = new Map<string, number>();
  for (const entity of graph.entities) {
    entityCounts.set(entity.type, (entityCounts.get(entity.type) ?? 0) + 1);
  }
  for (const edge of graph.edges) {
    edgeCounts.set(edge.type, (edgeCounts.get(edge.type) ?? 0) + 1);
  }

  const formatCounts = (label: string, counts: Map<string, number>): string => {
    if (counts.size === 0) {
      return `${label}: none`;
    }
    return `${label}: ${[...counts.entries()].sort().map(([key, value]) => `${key}=${value}`).join(', ')}`;
  };

  return [
    'Memory Graph',
    `Updated: ${graph.updatedAt}`,
    `Entities: ${graph.entities.length}`,
    `Edges: ${graph.edges.length}`,
    formatCounts('Entity types', entityCounts),
    formatCounts('Edge types', edgeCounts),
  ].join('\n');
};

export const formatRelatedMemories = (results: MemoryRelatedResult[]): string => {
  if (results.length === 0) {
    return 'No related memory facts found.';
  }

  return results.map((result, index) => [
    `${index + 1}. ${result.entity.name} (${result.entity.type}, confidence=${result.entity.confidence})`,
    `   Reasons: ${result.reasons.join(', ') || 'connected memory'}`,
    result.entity.observations.length > 0 ? `   Notes: ${result.entity.observations.slice(0, 2).join(' | ')}` : null,
    result.edges.length > 0 ? `   Edges: ${result.edges.map((edge) => edge.type).join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n');
};

export const formatMemoryReview = (findings: MemoryReviewFinding[]): string => {
  if (findings.length === 0) {
    return 'Memory review found no stale, duplicate, conflicting, or secret-like graph facts.';
  }

  return findings
    .map((finding) => `${finding.severity.toUpperCase()} ${finding.type}: ${finding.message} (${finding.entityIds.join(', ')})`)
    .join('\n');
};
