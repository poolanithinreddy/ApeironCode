import type {MemoryEntity} from './graphTypes.js';
import {isSuperseded} from './supersession.js';

export interface MemoryConflict {
  conflictType: 'same_key_different_value' | 'contradictory_observation' | 'newer_supersedes_older';
  description: string;
  entityIds: string[];
  entityNames: string[];
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
  uncertain: boolean;
}

const normalizeKey = (text: string): string =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');

const extractKey = (entity: MemoryEntity): string => normalizeKey(entity.name);

const wordJaccard = (a: string, b: string): number => {
  const aWords = new Set(a.toLowerCase().split(/\s+/u).filter((w) => w.length > 2));
  const bWords = new Set(b.toLowerCase().split(/\s+/u).filter((w) => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = aWords.size + bWords.size - intersection;
  return intersection / Math.max(union, 1);
};

const computeSimilarity = (a: string, b: string): number => {
  if (a.toLowerCase() === b.toLowerCase()) return 1.0;
  return wordJaccard(a, b);
};

const isVerified = (entity: MemoryEntity): boolean =>
  entity.metadata?.['verified'] === true;

export const detectConflicts = (entities: MemoryEntity[]): MemoryConflict[] => {
  const conflicts: MemoryConflict[] = [];
  const grouped = new Map<string, MemoryEntity[]>();

  for (const entity of entities) {
    if (isSuperseded(entity)) continue;
    const key = extractKey(entity);
    const bucket = grouped.get(key) ?? [];
    bucket.push(entity);
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    if (bucket.length < 2) continue;

    const sorted = [...bucket].sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt);
      const bTime = Date.parse(b.updatedAt || b.createdAt);
      return bTime - aTime;
    });

    const newest = sorted[0];
    if (!newest) continue;

    for (let i = 1; i < sorted.length; i++) {
      const older = sorted[i];
      if (!older) continue;
      const similarity = computeSimilarity(newest.name, older.name);
      if (similarity < 0.6) continue;

      const newerObs = newest.observations.join(' ');
      const olderObs = older.observations.join(' ');
      const obsKey = normalizeKey(newerObs);
      const oldObsKey = normalizeKey(olderObs);

      if (obsKey !== oldObsKey && newerObs && olderObs) {
        const obsOverlap = wordJaccard(newerObs, olderObs);
        const uncertain = obsOverlap > 0.3 || newest.confidence < 0.6 || older.confidence < 0.6;
        const newerVerified = isVerified(newest);
        const severity: MemoryConflict['severity'] = newerVerified && newest.confidence > 0.8
          ? 'high'
          : uncertain
            ? 'low'
            : 'medium';

        conflicts.push({
          conflictType: 'newer_supersedes_older',
          description: `Entity "${newest.name}" has conflicting observation vs older entry "${older.name}"`,
          entityIds: [newest.id, older.id],
          entityNames: [newest.name, older.name],
          recommendation: uncertain
            ? `Review both entries; conflict is uncertain. Consider merging "${older.name}" (${older.id}).`
            : `Remove or merge older entry "${older.name}" (${older.id}) after review.`,
          severity,
          uncertain,
        });
      }
    }
  }

  return conflicts.slice(0, 20);
};

export const findHighQualityVersion = (candidates: MemoryEntity[]): MemoryEntity => {
  return candidates.reduce((best, current) => {
    const verifiedBoost = (e: MemoryEntity): number => (isVerified(e) ? 0.15 : 0);
    const bestScore =
      best.confidence +
      verifiedBoost(best) +
      Date.parse(best.updatedAt || best.createdAt) / (24 * 60 * 60 * 1000 * 1000);
    const currentScore =
      current.confidence +
      verifiedBoost(current) +
      Date.parse(current.updatedAt || current.createdAt) / (24 * 60 * 60 * 1000 * 1000);
    return currentScore > bestScore ? current : best;
  });
};

export const hasUncertainConflict = (conflicts: MemoryConflict[]): boolean =>
  conflicts.some((c) => c.uncertain);
