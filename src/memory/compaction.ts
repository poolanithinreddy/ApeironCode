import type {MemoryEntity, MemoryGraph} from './graphTypes.js';
import {computeMemoryQualityScore} from './quality.js';
import {isSuperseded} from './supersession.js';
import {inferKindFromEntityType} from './taxonomy.js';

export interface CompactionOptions {
  maxEntities: number;
  minConfidence: number;
  staleDays: number;
}

export interface CompactionV2Options extends CompactionOptions {
  now?: number;
  preserveAccessedMin?: number;
  preserveKinds?: string[];
}

export interface CompactionReport {
  preserved: string[];
  removed: string[];
  superseded: string[];
  warnings: string[];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isStale = (entity: MemoryEntity, staleDays: number, now: number): boolean => {
  const updatedAt = getTimestamp(entity.updatedAt || entity.createdAt);
  if (updatedAt === 0) return true;
  return now - updatedAt > staleDays * DAY_IN_MS;
};

const rankForRemoval = (entity: MemoryEntity): number => {
  const quality = computeMemoryQualityScore(entity).score;
  return entity.confidence * 10 + quality * 5 + getTimestamp(entity.updatedAt || entity.createdAt) / DAY_IN_MS;
};

const isImportantStaleMemory = (entity: MemoryEntity): boolean =>
  entity.confidence >= 0.9 &&
  ['decision', 'convention', 'module', 'file'].includes(entity.type) &&
  computeMemoryQualityScore(entity).score >= 0.7;

export const compactMemoryGraph = (
  graph: MemoryGraph,
  options: CompactionOptions,
): MemoryGraph => {
  const now = Date.now();
  let staleMarked = 0;

  let entities = graph.entities.map((entity) => {
    const stale = entity.stale || (isStale(entity, options.staleDays, now) && !isImportantStaleMemory(entity));
    if (stale && !entity.stale) staleMarked += 1;
    return {...entity, stale};
  });

  const beforeEntityCount = entities.length;
  entities = entities.filter((entity) => {
    if (computeMemoryQualityScore(entity, now).signals.sensitivityPenalty <= 0.5) return false;
    return !(entity.stale && entity.confidence < options.minConfidence);
  });

  if (entities.length > options.maxEntities) {
    const keepIds = new Set(
      [...entities]
        .sort((left, right) => rankForRemoval(right) - rankForRemoval(left))
        .slice(0, options.maxEntities)
        .map((entity) => entity.id),
    );
    entities = entities.filter((entity) => keepIds.has(entity.id));
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  const edges = graph.edges.filter((edge) => entityIds.has(edge.from) && entityIds.has(edge.to));

  return {
    ...graph,
    edges,
    entities,
    metadata: {
      ...graph.metadata,
      compaction: {
        appliedAt: new Date(now).toISOString(),
        maxEntities: options.maxEntities,
        minConfidence: options.minConfidence,
        removedEdges: graph.edges.length - edges.length,
        removedEntities: beforeEntityCount - entities.length,
        staleDays: options.staleDays,
        staleMarked,
      },
    },
    updatedAt: new Date(now).toISOString(),
  };
};

const PRESERVE_KINDS = new Set(['decision', 'convention', 'user_preference', 'pitfall']);
const AGGRESSIVE_COMPACT_KINDS = new Set(['session_summary', 'fix_recipe']);
const ACCESS_COUNT_THRESHOLD = 3;

const getAccessCount = (entity: MemoryEntity): number => {
  const count = entity.metadata?.['accessCount'];
  return typeof count === 'number' ? count : 0;
};

const isFrequentlyAccessed = (entity: MemoryEntity, min: number): boolean =>
  getAccessCount(entity) >= min;

const isExpiredSuperseded = (entity: MemoryEntity, now: number, ttlDays = 14): boolean => {
  if (!isSuperseded(entity)) return false;
  const updatedAt = getTimestamp(entity.updatedAt || entity.createdAt);
  return now - updatedAt > ttlDays * DAY_IN_MS;
};

export const compactMemoryGraphV2 = (
  graph: MemoryGraph,
  options: CompactionV2Options,
): {graph: MemoryGraph; report: CompactionReport} => {
  const now = options.now ?? Date.now();
  const preserveKinds = new Set(options.preserveKinds ?? [...PRESERVE_KINDS]);
  const accessMin = options.preserveAccessedMin ?? ACCESS_COUNT_THRESHOLD;
  const warnings: string[] = [];
  const removed: string[] = [];
  const superseded: string[] = [];
  const preserved: string[] = [];

  let staleMarked = 0;
  let entities = graph.entities.map((entity) => {
    const stale = entity.stale || (isStale(entity, options.staleDays, now) && !isImportantStaleMemory(entity));
    if (stale && !entity.stale) staleMarked += 1;
    return {...entity, stale};
  });

  const beforeCount = entities.length;

  entities = entities.filter((entity) => {
    const kind = inferKindFromEntityType(entity.type);

    if (isExpiredSuperseded(entity, now)) {
      superseded.push(entity.id);
      return false;
    }

    if (computeMemoryQualityScore(entity, now).signals.sensitivityPenalty <= 0.5) {
      warnings.push(`Removed sensitive entity: ${entity.id}`);
      removed.push(entity.id);
      return false;
    }

    if (entity.stale && entity.confidence < options.minConfidence) {
      if (preserveKinds.has(kind) && entity.confidence >= options.minConfidence * 0.8) {
        preserved.push(entity.id);
        return true;
      }
      removed.push(entity.id);
      return false;
    }

    if (entity.tags.includes('duplicate-noise') || entity.metadata?.['duplicateNoise'] === true) {
      removed.push(entity.id);
      return false;
    }

    if (AGGRESSIVE_COMPACT_KINDS.has(kind) && entity.stale) {
      removed.push(entity.id);
      return false;
    }

    if (isFrequentlyAccessed(entity, accessMin)) {
      preserved.push(entity.id);
    }

    return true;
  });

  if (entities.length > options.maxEntities) {
    const keepIds = new Set(
      [...entities]
        .sort((left, right) => {
          const kindL = inferKindFromEntityType(left.type);
          const kindR = inferKindFromEntityType(right.type);
          const preserveL = preserveKinds.has(kindL) ? 1 : 0;
          const preserveR = preserveKinds.has(kindR) ? 1 : 0;
          if (preserveL !== preserveR) return preserveR - preserveL;
          return rankForRemoval(right) - rankForRemoval(left);
        })
        .slice(0, options.maxEntities)
        .map((entity) => entity.id),
    );
    for (const entity of entities) {
      if (!keepIds.has(entity.id)) removed.push(entity.id);
    }
    entities = entities.filter((entity) => keepIds.has(entity.id));
  }

  if (beforeCount - entities.length > 50) {
    warnings.push(`Large compaction: removed ${beforeCount - entities.length} entities`);
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  const edges = graph.edges.filter((edge) => entityIds.has(edge.from) && entityIds.has(edge.to));

  return {
    graph: {
      ...graph,
      edges,
      entities,
      metadata: {
        ...graph.metadata,
        compaction: {
          appliedAt: new Date(now).toISOString(),
          maxEntities: options.maxEntities,
          minConfidence: options.minConfidence,
          removedEdges: graph.edges.length - edges.length,
          removedEntities: beforeCount - entities.length,
          staleDays: options.staleDays,
          staleMarked,
        },
      },
      updatedAt: new Date(now).toISOString(),
    },
    report: {preserved, removed, superseded, warnings},
  };
};
