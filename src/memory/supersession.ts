import type {MemoryEntity} from './graphTypes.js';

export interface SupersessionRecord {
  newerEntityId: string;
  olderEntityId: string;
  reason: string;
  score: number;
}

export interface SupersessionApplyResult {
  entities: MemoryEntity[];
  records: SupersessionRecord[];
}

const normalizeSubject = (text: string): string =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/gu, ' ').replace(/\s+/gu, ' ').trim();

const subjectKey = (entity: MemoryEntity): string => {
  const explicit = entity.metadata?.['subjectKey'] ?? entity.metadata?.['key'];
  if (typeof explicit === 'string' && explicit.trim()) return normalizeSubject(explicit);
  const text = normalizeSubject(`${entity.name} ${entity.observations.join(' ')}`);
  if (/\bprovider chat\b|\bprovider stream\b/u.test(text)) return 'provider stream interface';
  if (/\bmcp\b/u.test(text)) return 'mcp transport support';
  if (/\bsandbox\b|\bsandboxmanager\b/u.test(text)) return 'sandbox support';
  if (/\btest command\b|\bnpm test\b|\bnpm run test\b/u.test(text)) return 'test command';
  return normalizeSubject(entity.name);
};

const wordJaccard = (a: string, b: string): number => {
  const aWords = new Set(a.split(' ').filter((w) => w.length > 2));
  const bWords = new Set(b.split(' ').filter((w) => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = aWords.size + bWords.size - intersection;
  return intersection / Math.max(union, 1);
};

const isSameSubject = (a: MemoryEntity, b: MemoryEntity): boolean => {
  const aNorm = subjectKey(a);
  const bNorm = subjectKey(b);
  if (aNorm === bNorm) return true;
  if (a.type !== b.type) return false;
  return wordJaccard(aNorm, bNorm) >= 0.65;
};

const hasContradictoryObservations = (a: MemoryEntity, b: MemoryEntity): boolean => {
  const aObs = a.observations.join(' ');
  const bObs = b.observations.join(' ');
  if (!aObs || !bObs) return false;
  const combined = normalizeSubject(`${aObs} ${bObs}`);
  if (/\breplaced\b|\bsuperseded\b|\bdeprecated\b|\bno longer\b/u.test(combined)) return true;
  if (combined.includes('provider chat') && combined.includes('provider stream')) return true;
  if (combined.includes('stdio only') && (combined.includes('http') || combined.includes('sse'))) return true;
  const sim = wordJaccard(normalizeSubject(aObs), normalizeSubject(bObs));
  return sim < 0.4;
};

const supersessionScore = (candidate: MemoryEntity, target: MemoryEntity): number => {
  let score = 0;
  const candidateTime = Date.parse(candidate.updatedAt || candidate.createdAt);
  const targetTime = Date.parse(target.updatedAt || target.createdAt);
  if (!Number.isNaN(candidateTime) && !Number.isNaN(targetTime)) {
    if (candidateTime > targetTime) score += 0.4;
  }
  if (candidate.confidence > target.confidence + 0.1) score += 0.3;
  if (candidate.metadata?.['verified'] === true) score += 0.2;
  if (target.stale) score += 0.1;
  return score;
};

export const detectSupersession = (entities: MemoryEntity[]): SupersessionRecord[] => {
  const records: SupersessionRecord[] = [];
  const alreadySuperseded = new Set<string>();

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i]!;
      const b = entities[j]!;
      if (alreadySuperseded.has(a.id) || alreadySuperseded.has(b.id)) continue;
      if (!isSameSubject(a, b)) continue;
      if (!hasContradictoryObservations(a, b)) continue;

      const scoreAoverB = supersessionScore(a, b);
      const scoreBoverA = supersessionScore(b, a);

      if (scoreAoverB >= 0.4 && scoreAoverB > scoreBoverA) {
        records.push({newerEntityId: a.id, olderEntityId: b.id, reason: 'newer/higher-confidence fact', score: scoreAoverB});
        alreadySuperseded.add(b.id);
      } else if (scoreBoverA >= 0.4 && scoreBoverA > scoreAoverB) {
        records.push({newerEntityId: b.id, olderEntityId: a.id, reason: 'newer/higher-confidence fact', score: scoreBoverA});
        alreadySuperseded.add(a.id);
      }
    }
  }

  return records;
};

const setMetaFlag = (entity: MemoryEntity, key: string, value: unknown): MemoryEntity => ({
  ...entity,
  metadata: {...(entity.metadata ?? {}), [key]: value},
});

export const applySupersession = (
  entities: MemoryEntity[],
  records: SupersessionRecord[],
): SupersessionApplyResult => {
  const newerIds = new Map<string, string[]>();
  const olderIds = new Map<string, string>();

  for (const rec of records) {
    const list = newerIds.get(rec.newerEntityId) ?? [];
    list.push(rec.olderEntityId);
    newerIds.set(rec.newerEntityId, list);
    olderIds.set(rec.olderEntityId, rec.newerEntityId);
  }

  const updated = entities.map((entity) => {
    const supersedingId = olderIds.get(entity.id);
    if (supersedingId) {
      return setMetaFlag(
        setMetaFlag(entity, 'supersededBy', supersedingId),
        'deprecated',
        true,
      );
    }
    const supersededList = newerIds.get(entity.id);
    if (supersededList && supersededList.length > 0) {
      return setMetaFlag(entity, 'supersedes', supersededList);
    }
    return entity;
  });

  return {entities: updated, records};
};

export const isSuperseded = (entity: MemoryEntity): boolean =>
  Boolean(entity.metadata?.['supersededBy']) || entity.metadata?.['deprecated'] === true;

export const filterSuperseded = (entities: MemoryEntity[]): MemoryEntity[] =>
  entities.filter((e) => !isSuperseded(e));

export const markInvalidated = (entity: MemoryEntity, byId: string): MemoryEntity =>
  setMetaFlag(setMetaFlag(entity, 'invalidatedBy', byId), 'deprecated', true);

export const supersessionSummary = (records: SupersessionRecord[]): string => {
  if (records.length === 0) return 'no supersessions detected';
  return `${records.length} supersession(s) detected`;
};
