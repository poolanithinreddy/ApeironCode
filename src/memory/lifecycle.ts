import type {MemoryEntity} from './graphTypes.js';
import {isMemoryExpired, isMemoryStale} from './taxonomy.js';
import {inferKindFromEntityType} from './taxonomy.js';

export interface LifecycleOptions {
  now?: number;
  promotionThreshold?: number;
  staleConfidencePenalty?: number;
}

export interface LifecycleReport {
  boosted: string[];
  demoted: string[];
  expired: string[];
  promoted: string[];
}

const SESSION_TYPES = new Set<string>(['session']);
const GLOBAL_TYPES = new Set<string>(['user_preference', 'convention']);

const isVerified = (entity: MemoryEntity): boolean =>
  entity.metadata?.['verified'] === true;

const getAccessCount = (entity: MemoryEntity): number => {
  const count = entity.metadata?.['accessCount'];
  return typeof count === 'number' ? count : 0;
};

export const promoteSessionMemory = (
  entities: MemoryEntity[],
  options: LifecycleOptions = {},
): {entities: MemoryEntity[]; promoted: string[]} => {
  const threshold = options.promotionThreshold ?? 2;
  const promoted: string[] = [];

  const updated = entities.map((entity) => {
    if (!SESSION_TYPES.has(entity.type)) return entity;
    const accessCount = getAccessCount(entity);
    if (accessCount < threshold && !isVerified(entity)) return entity;

    const kind = inferKindFromEntityType(entity.type);
    const targetScope = GLOBAL_TYPES.has(kind) ? 'global' : 'project';
    promoted.push(entity.id);
    return {
      ...entity,
      metadata: {
        ...(entity.metadata ?? {}),
        promotedAt: new Date().toISOString(),
        promotedFrom: 'session',
        promotedTo: targetScope,
      },
    };
  });

  return {entities: updated, promoted};
};

export const demoteStaleMemory = (
  entities: MemoryEntity[],
  options: LifecycleOptions = {},
): {entities: MemoryEntity[]; demoted: string[]; expired: string[]} => {
  const now = options.now ?? Date.now();
  const penalty = options.staleConfidencePenalty ?? 0.1;
  const demoted: string[] = [];
  const expired: string[] = [];

  const updated = entities.map((entity) => {
    const kind = inferKindFromEntityType(entity.type);
    const updatedAt = entity.updatedAt || entity.createdAt;

    if (isMemoryExpired(kind, updatedAt, now)) {
      expired.push(entity.id);
      return {
        ...entity,
        metadata: {...(entity.metadata ?? {}), expired: true},
        stale: true,
      };
    }

    if (isMemoryStale(kind, updatedAt, now) && !entity.stale) {
      demoted.push(entity.id);
      return {
        ...entity,
        confidence: Math.max(entity.confidence - penalty, 0.1),
        stale: true,
      };
    }

    return entity;
  });

  return {demoted, entities: updated, expired};
};

export const boostAccessedMemory = (
  entities: MemoryEntity[],
): {entities: MemoryEntity[]; boosted: string[]} => {
  const boosted: string[] = [];

  const updated = entities.map((entity) => {
    const accessCount = getAccessCount(entity);
    const verifiedBoost = isVerified(entity) ? 0.05 : 0;
    const accessBoost = accessCount >= 5 ? 0.1 : accessCount >= 2 ? 0.05 : 0;
    const totalBoost = verifiedBoost + accessBoost;

    if (totalBoost <= 0) return entity;
    if (entity.confidence >= 0.98) return entity;

    boosted.push(entity.id);
    return {
      ...entity,
      confidence: Math.min(entity.confidence + totalBoost, 1.0),
    };
  });

  return {boosted, entities: updated};
};

export const recordAccess = (entity: MemoryEntity): MemoryEntity => {
  const count = getAccessCount(entity);
  return {
    ...entity,
    metadata: {
      ...(entity.metadata ?? {}),
      accessCount: count + 1,
      lastAccessedAt: new Date().toISOString(),
    },
  };
};

export const applyLifecyclePolicies = (
  entities: MemoryEntity[],
  options: LifecycleOptions = {},
): {entities: MemoryEntity[]; report: LifecycleReport} => {
  const staleResult = demoteStaleMemory(entities, options);
  const promoteResult = promoteSessionMemory(staleResult.entities, options);
  const boostResult = boostAccessedMemory(promoteResult.entities);

  return {
    entities: boostResult.entities,
    report: {
      boosted: boostResult.boosted,
      demoted: staleResult.demoted,
      expired: staleResult.expired,
      promoted: promoteResult.promoted,
    },
  };
};
