import crypto from 'node:crypto';

import type {
  MemoryEdge,
  MemoryEdgeInput,
  MemoryEntity,
  MemoryFactInput,
  MemoryGraph,
  MemoryReviewFinding,
} from './graphTypes.js';
import {containsSecretLikeContent, redactSecretLikeContent} from './safety.js';

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, ' ');

export const redactMemoryText = (value: string): string => {
  return redactSecretLikeContent(value);
};

export const createMemoryEntityId = (type: string, name: string): string => {
  const digest = crypto.createHash('sha256').update(`${type}:${normalize(name)}`).digest('hex').slice(0, 16);
  return `${type}:${digest}`;
};

export const createMemoryEdgeId = (type: string, from: string, to: string): string => {
  const digest = crypto.createHash('sha256').update(`${type}:${from}:${to}`).digest('hex').slice(0, 16);
  return `edge:${digest}`;
};

export const upsertMemoryFact = (graph: MemoryGraph, input: MemoryFactInput): MemoryGraph => {
  const now = new Date().toISOString();
  const id = createMemoryEntityId(input.type, input.name);
  const observation = redactMemoryText(input.observation.trim());
  const existing = graph.entities.find((entity) => entity.id === id);

  if (existing) {
    const observations = observation && !existing.observations.includes(observation)
      ? [...existing.observations, observation]
      : existing.observations;
    return {
      ...graph,
      entities: graph.entities.map((entity) => entity.id === id
        ? {
            ...entity,
            confidence: Math.max(entity.confidence, input.confidence ?? entity.confidence),
            metadata: {...entity.metadata, ...input.metadata},
            observations,
            stale: false,
            tags: Array.from(new Set([...entity.tags, ...(input.tags ?? [])])),
            updatedAt: now,
          }
        : entity),
      updatedAt: now,
    };
  }

  const entity: MemoryEntity = {
    confidence: input.confidence ?? 0.7,
    createdAt: now,
    id,
    metadata: input.metadata,
    name: redactMemoryText(input.name.trim()),
    observations: observation ? [observation] : [],
    source: input.source ?? 'user',
    tags: input.tags ?? [],
    type: input.type,
    updatedAt: now,
  };

  return {
    ...graph,
    entities: [...graph.entities, entity],
    updatedAt: now,
  };
};

export const upsertMemoryEdge = (graph: MemoryGraph, input: MemoryEdgeInput): MemoryGraph => {
  const now = new Date().toISOString();
  const id = createMemoryEdgeId(input.type, input.from, input.to);
  const existing = graph.edges.find((edge) => edge.id === id);

  const edge: MemoryEdge = {
    confidence: input.confidence ?? existing?.confidence ?? 0.7,
    createdAt: existing?.createdAt ?? now,
    from: input.from,
    id,
    metadata: {...existing?.metadata, ...input.metadata},
    source: input.source ?? existing?.source ?? 'user',
    to: input.to,
    type: input.type,
    updatedAt: now,
  };

  return {
    ...graph,
    edges: existing
      ? graph.edges.map((candidate) => candidate.id === id ? edge : candidate)
      : [...graph.edges, edge],
    updatedAt: now,
  };
};

const hasSecret = (entity: MemoryEntity): boolean =>
  containsSecretLikeContent(`${entity.name}\n${entity.observations.join('\n')}`);

export const reviewMemoryGraph = (graph: MemoryGraph): MemoryReviewFinding[] => {
  const findings: MemoryReviewFinding[] = [];
  const byKey = new Map<string, MemoryEntity[]>();

  for (const entity of graph.entities) {
    const key = `${entity.type}:${normalize(entity.name)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), entity]);
    if (entity.stale) {
      findings.push({
        entityIds: [entity.id],
        message: `${entity.name} is marked stale and should be confirmed or pruned.`,
        severity: 'warning',
        type: 'stale',
      });
    }
    if (hasSecret(entity)) {
      findings.push({
        entityIds: [entity.id],
        message: `${entity.name} appears to contain secret-like text.`,
        severity: 'warning',
        type: 'secret',
      });
    }
  }

  for (const duplicates of byKey.values()) {
    if (duplicates.length > 1) {
      findings.push({
        entityIds: duplicates.map((entity) => entity.id),
        message: `Duplicate memory facts for ${duplicates[0]?.name ?? 'unknown entity'}.`,
        severity: 'info',
        type: 'duplicate',
      });
    }
  }

  const grouped = new Map<string, MemoryEntity[]>();
  for (const entity of graph.entities) {
    grouped.set(entity.type, [...(grouped.get(entity.type) ?? []), entity]);
  }
  for (const [type, entities] of grouped) {
    const active = entities.filter((entity) => !entity.stale);
    const names = new Set(active.map((entity) => normalize(entity.name)));
    if ((type === 'provider' || type === 'model' || type === 'user_preference') && names.size > 1) {
      findings.push({
        entityIds: active.map((entity) => entity.id),
        message: `Multiple active ${type} memories may conflict: ${active.map((entity) => entity.name).join(', ')}.`,
        severity: 'warning',
        type: 'conflict',
      });
    }
  }

  return findings;
};

export const pruneMemoryGraph = (graph: MemoryGraph): MemoryGraph => {
  const entityIds = new Set(graph.entities.filter((entity) => !entity.stale).map((entity) => entity.id));
  return {
    ...graph,
    edges: graph.edges.filter((edge) => entityIds.has(edge.from) && entityIds.has(edge.to)),
    entities: graph.entities.filter((entity) => !entity.stale),
    updatedAt: new Date().toISOString(),
  };
};
