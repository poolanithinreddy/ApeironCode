import type {MemoryEdge, MemoryEntity, MemoryGraph, MemoryReviewFinding} from './graphTypes.js';
import type {MemorySuggestion} from './suggestions.js';

export interface MemoryControlResult {
  changed: boolean;
  graph: MemoryGraph;
  message: string;
}

const matchesSession = (value: unknown, sessionId: string): boolean => {
  if (typeof value === 'string') {
    return value === sessionId || value.includes(sessionId);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => matchesSession(entry, sessionId));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => matchesSession(entry, sessionId));
  }
  return false;
};

const formatEntity = (entity: MemoryEntity): string => [
  `Entity: ${entity.id}`,
  `Type: ${entity.type}`,
  `Name: ${entity.name}`,
  `Source: ${entity.source}`,
  `Confidence: ${entity.confidence}`,
  `Tags: ${entity.tags.join(', ') || 'none'}`,
  `Created: ${entity.createdAt}`,
  `Updated: ${entity.updatedAt}`,
  entity.metadata ? `Metadata: ${JSON.stringify(entity.metadata)}` : 'Metadata: none',
  `Observations: ${entity.observations.join(' | ') || 'none'}`,
].join('\n');

const formatEdge = (edge: MemoryEdge): string => [
  `Edge: ${edge.id}`,
  `Type: ${edge.type}`,
  `From: ${edge.from}`,
  `To: ${edge.to}`,
  `Source: ${edge.source}`,
  `Confidence: ${edge.confidence}`,
  `Created: ${edge.createdAt}`,
  `Updated: ${edge.updatedAt}`,
  edge.metadata ? `Metadata: ${JSON.stringify(edge.metadata)}` : 'Metadata: none',
].join('\n');

export const formatMemorySourceTrace = (
  graph: MemoryGraph,
  suggestions: MemorySuggestion[],
  id: string,
): string => {
  const entity = graph.entities.find((entry) => entry.id === id);
  if (entity) {
    const edges = graph.edges.filter((edge) => edge.from === id || edge.to === id);
    return [
      'Memory Source Trace',
      formatEntity(entity),
      '',
      edges.length ? `Related edges:\n${edges.map((edge) => `- ${edge.id} ${edge.type} ${edge.from} -> ${edge.to}`).join('\n')}` : 'Related edges: none',
    ].join('\n');
  }

  const edge = graph.edges.find((entry) => entry.id === id);
  if (edge) {
    return ['Memory Source Trace', formatEdge(edge)].join('\n');
  }

  const suggestion = suggestions.find((entry) => entry.id === id);
  if (suggestion) {
    return [
      'Memory Source Trace',
      `Suggestion: ${suggestion.id}`,
      `Status: ${suggestion.status}`,
      `Source: ${suggestion.source}`,
      `Confidence: ${suggestion.confidence}`,
      `Summary: ${suggestion.summary}`,
      `Related session: ${suggestion.relatedSessionId ?? 'none'}`,
      `Related files: ${suggestion.relatedFiles?.join(', ') || 'none'}`,
      `Redaction applied: ${suggestion.redactionApplied ? 'yes' : 'no'}`,
    ].join('\n');
  }

  return `Memory item not found: ${id}`;
};

export const rollbackMemoryItem = (
  graph: MemoryGraph,
  id: string,
  confirmed: boolean,
): MemoryControlResult => {
  const entity = graph.entities.find((entry) => entry.id === id);
  const edge = graph.edges.find((entry) => entry.id === id);
  if (!entity && !edge) {
    return {changed: false, graph, message: `Memory item not found: ${id}`};
  }

  const affectedEdges = entity ? graph.edges.filter((entry) => entry.from === id || entry.to === id) : [];
  const preview = entity
    ? `Rollback preview: remove entity ${id} (${entity.type}) and ${affectedEdges.length} related edge${affectedEdges.length === 1 ? '' : 's'}.`
    : `Rollback preview: remove edge ${id} (${edge?.type ?? 'unknown'}).`;

  if (!confirmed) {
    return {changed: false, graph, message: `${preview}\nRe-run with --yes to confirm.`};
  }

  return {
    changed: true,
    graph: {
      ...graph,
      edges: entity
        ? graph.edges.filter((entry) => entry.from !== id && entry.to !== id)
        : graph.edges.filter((entry) => entry.id !== id),
      entities: entity ? graph.entities.filter((entry) => entry.id !== id) : graph.entities,
    },
    message: preview.replace('Rollback preview:', 'Rolled back:'),
  };
};

export const forgetSessionMemories = (
  graph: MemoryGraph,
  sessionId: string,
  confirmed: boolean,
): MemoryControlResult => {
  const entityIds = new Set(
    graph.entities
      .filter((entity) =>
        entity.id === sessionId ||
        matchesSession(entity.metadata, sessionId) ||
        entity.tags.includes(sessionId) ||
        entity.observations.some((observation) => observation.includes(sessionId)),
      )
      .map((entity) => entity.id),
  );
  const directEdgeIds = new Set(
    graph.edges
      .filter((edge) =>
        edge.id === sessionId ||
        matchesSession(edge.metadata, sessionId) ||
        edge.from === sessionId ||
        edge.to === sessionId,
      )
      .map((edge) => edge.id),
  );
  const edgeCount = graph.edges.filter((edge) =>
    directEdgeIds.has(edge.id) || entityIds.has(edge.from) || entityIds.has(edge.to),
  ).length;
  const preview = `Forget-session preview: remove ${entityIds.size} entit${entityIds.size === 1 ? 'y' : 'ies'} and ${edgeCount} edge${edgeCount === 1 ? '' : 's'} linked to ${sessionId}.`;

  if (!confirmed) {
    return {changed: false, graph, message: `${preview}\nRe-run with --yes to confirm.`};
  }

  return {
    changed: true,
    graph: {
      ...graph,
      edges: graph.edges.filter((edge) =>
        !directEdgeIds.has(edge.id) && !entityIds.has(edge.from) && !entityIds.has(edge.to),
      ),
      entities: graph.entities.filter((entity) => !entityIds.has(entity.id)),
    },
    message: preview.replace('Forget-session preview:', 'Forgot session:'),
  };
};

export const formatMemoryFindings = (
  title: string,
  findings: MemoryReviewFinding[],
): string => {
  const visible = findings.filter((finding) =>
    title.toLowerCase().includes('stale') ? finding.type === 'stale' : finding.type === 'conflict',
  );
  if (visible.length === 0) {
    return `${title}\nNo ${title.toLowerCase()} found.`;
  }
  return [
    title,
    ...visible.map((finding) => [
      `- ${finding.severity.toUpperCase()} ${finding.type}: ${finding.message}`,
      `  Entities: ${finding.entityIds.join(', ') || 'none'}`,
    ].join('\n')),
  ].join('\n');
};
