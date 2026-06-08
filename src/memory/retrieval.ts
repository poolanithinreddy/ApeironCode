import type {MemoryEntity, MemorySearchOptions} from './graphTypes.js';
import {computeMemoryQualityScore} from './quality.js';
import {containsSecretLikeContent} from './safety.js';

export interface MemoryRetrievalScore {
  entityId: string;
  finalScore: number;
  components: {
    lexical: number;
    typeRelevance: number;
    recency: number;
    confidence: number;
    accessFrequency: number;
    fileRelevance: number;
    graphNeighborhood: number;
  };
  reasons: string[];
}

export interface ExplainedMemorySelection {
  entity: MemoryEntity;
  score: MemoryRetrievalScore;
}

const TYPE_RELEVANCE_SCORES: Record<string, number> = {
  decision: 0.95,
  architecture_decision: 0.93,
  convention: 0.85,
  command: 0.82,
  task: 0.80,
  file: 0.75,
  error: 0.70,
  bug: 0.68,
  fix: 0.75,
  test: 0.72,
  dependency: 0.60,
  module: 0.65,
  provider: 0.70,
  model: 0.70,
  user_preference: 0.80,
  plan: 0.78,
  session: 0.50,
  symbol: 0.50,
  skill: 0.60,
};

export const computeTypeRelevance = (entityType: string): number => {
  return TYPE_RELEVANCE_SCORES[entityType] ?? 0.5;
};

export const computeRecencyScore = (
  createdAt: string,
  updatedAt: string,
  now: number = Date.now(),
): number => {
  const timestamp = updatedAt ? Date.parse(updatedAt) : Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1000));

  if (ageDays <= 7) {
    return 1.0;
  }
  if (ageDays <= 30) {
    return 0.8 - (ageDays - 7) / 30 * 0.2;
  }
  if (ageDays <= 90) {
    return 0.6 - (ageDays - 30) / 60 * 0.3;
  }
  return Math.max(0.1, 0.3 - ageDays / 365 * 0.2);
};

export const extractMentionedFiles = (query: string): Set<string> => {
  const matches = query.match(/\b(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+\b|\b[\w.-]+\.(?:ts|tsx|js|jsx|json|md|yml|yaml|toml|rs|go|py|java|kt|swift|css|scss|html)\b/gu) ?? [];
  return new Set(matches.map((match) => match.replace(/^['"`]+|['"`]+$/gu, '').toLowerCase()));
};

export const computeAccessFrequencyScore = (
  metadata: Record<string, unknown> | undefined,
): number => {
  const accessCount = typeof metadata?.accessCount === 'number' ? metadata.accessCount : 0;
  if (accessCount === 0) {
    return 0;
  }

  const lastAccessedAt = typeof metadata?.lastAccessedAt === 'string'
    ? Date.parse(metadata.lastAccessedAt)
    : 0;
  const now = Date.now();

  if (Number.isNaN(lastAccessedAt) || lastAccessedAt === 0) {
    return Math.min(0.15, accessCount * 0.01);
  }

  const daysSinceAccess = Math.max(0, (now - lastAccessedAt) / (24 * 60 * 60 * 1000));
  const accessBonus = Math.min(0.15, accessCount * 0.01);
  const recencyBonus = Math.max(0, 0.1 - daysSinceAccess / 30 * 0.1);

  return accessBonus + recencyBonus;
};

export const computeFileRelevanceScore = (
  entity: MemoryEntity,
  mentionedFiles: Set<string>,
): number => {
  if (mentionedFiles.size === 0) {
    return 0;
  }

  const combined = [
    entity.name,
    entity.observations.join(' '),
    entity.tags.join(' '),
    JSON.stringify(entity.metadata ?? {}),
  ].join(' ').toLowerCase();

  for (const file of mentionedFiles) {
    const fileName = file.toLowerCase();
    const basename = fileName.split('/').pop() ?? fileName;
    if (combined.includes(fileName) || combined.includes(basename)) {
      return 0.25;
    }
  }

  return 0;
};

export const computeGraphNeighborhoodScore = (
  entity: MemoryEntity,
  allEntities: Map<string, MemoryEntity>,
  allRelations: Array<{from: string; to: string}>,
  query: string,
): number => {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const entityId = entity.id;
  const neighbors = new Set<string>();

  for (const rel of allRelations) {
    if (rel.from === entityId) {
      neighbors.add(rel.to);
    } else if (rel.to === entityId) {
      neighbors.add(rel.from);
    }
  }

  if (neighbors.size === 0) {
    return 0;
  }

  let matchedNeighbors = 0;
  for (const neighborId of neighbors) {
    const neighbor = allEntities.get(neighborId);
    if (!neighbor) {
      continue;
    }

    const neighborText = `${neighbor.name} ${neighbor.observations.join(' ')}`.toLowerCase();
    if (queryTerms.some(term => neighborText.includes(term))) {
      matchedNeighbors += 1;
    }
  }

  return Math.min(0.2, (matchedNeighbors / neighbors.size) * 0.3);
};

export const computeRetrievalScore = (
  entity: MemoryEntity,
  lexicalScore: number,
  context: {
    mentionedFiles?: Set<string>;
    allEntities?: Map<string, MemoryEntity>;
    allRelations?: Array<{from: string; to: string}>;
    query?: string;
    now?: number;
    options?: MemorySearchOptions;
  } = {},
): MemoryRetrievalScore => {
  const now = context.now ?? Date.now();
  const query = context.query ?? '';
  const mentionedFiles = context.mentionedFiles ?? extractMentionedFiles(query);

  const components = {
    lexical: Math.max(0, Math.min(1, lexicalScore)),
    typeRelevance: computeTypeRelevance(entity.type),
    recency: computeRecencyScore(entity.createdAt, entity.updatedAt, now),
    confidence: entity.confidence,
    accessFrequency: computeAccessFrequencyScore(entity.metadata),
    fileRelevance: computeFileRelevanceScore(entity, mentionedFiles),
    graphNeighborhood: computeGraphNeighborhoodScore(
      entity,
      context.allEntities ?? new Map<string, MemoryEntity>(),
      context.allRelations ?? [],
      query,
    ),
  };

  const weights = {
    lexical: 0.35,
    typeRelevance: 0.15,
    recency: 0.15,
    confidence: 0.15,
    accessFrequency: 0.08,
    fileRelevance: 0.08,
    graphNeighborhood: 0.04,
  };

  let finalScore = Object.entries(components).reduce((sum, [key, value]) => {
    return sum + (value * weights[key as keyof typeof weights]);
  }, 0);
  const quality = computeMemoryQualityScore(entity, now);
  finalScore *= 0.65 + quality.score * 0.35;

  if (entity.stale && entity.confidence < 0.9 && quality.score < 0.75) {
    finalScore *= 0.35;
  }

  const reasons: string[] = [];

  if (components.lexical > 0.5) {
    reasons.push('matched the task text');
  }
  if (components.typeRelevance > 0.8) {
    reasons.push(`matched useful memory type ${entity.type}`);
  }
  if (components.recency > 0.7) {
    reasons.push('updated recently');
  }
  if (components.accessFrequency > 0.05) {
    reasons.push('used recently or often');
  }
  if (components.fileRelevance > 0) {
    reasons.push('mentions the target file');
  }
  if (components.graphNeighborhood > 0.05) {
    reasons.push('connected to related memory');
  }
  if (entity.confidence >= 0.85) {
    reasons.push('high-confidence memory');
  }
  if (entity.stale && entity.confidence >= 0.9 && quality.score >= 0.75) {
    reasons.push('old but high-confidence architecture memory');
  }

  return {
    entityId: entity.id,
    finalScore: Number(Math.max(0, Math.min(1, finalScore)).toFixed(6)),
    components,
    reasons,
  };
};

export const shouldFilterRetrievedMemory = (
  entity: MemoryEntity,
  score: MemoryRetrievalScore,
  options: MemorySearchOptions = {topK: 10},
  now: number = Date.now(),
): boolean => {
  if (containsSecretLikeContent(`${entity.name}\n${entity.observations.join('\n')}\n${JSON.stringify(entity.metadata ?? {})}`)) {
    return true;
  }

  if (entity.metadata?.['deprecated'] === true || typeof entity.metadata?.['supersededBy'] === 'string') {
    return true;
  }

  if (options.minConfidence !== undefined && entity.confidence < options.minConfidence) {
    return true;
  }

  if (options.maxAgeDays !== undefined) {
    const timestamp = Date.parse(entity.updatedAt || entity.createdAt);
    const ageDays = Number.isNaN(timestamp)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1000));
    const preserveImportant = entity.confidence >= 0.9
      && ['decision', 'convention', 'module', 'file'].includes(entity.type)
      && computeMemoryQualityScore(entity, now).score >= 0.7;
    if (ageDays > options.maxAgeDays && !preserveImportant) {
      return true;
    }
  }

  if (entity.stale && entity.confidence < 0.75) {
    return true;
  }

  const quality = computeMemoryQualityScore(entity, now);
  if (quality.score < 0.28 && score.components.lexical < 0.75 && score.components.fileRelevance === 0) {
    return true;
  }

  return score.finalScore < 0.08;
};

export const explainRelevantMemory = (
  selectedEntities: MemoryEntity[],
  scores: Map<string, MemoryRetrievalScore>,
): ExplainedMemorySelection[] => {
  return selectedEntities
    .map(entity => ({
      entity,
      score: scores.get(entity.id) ?? {
        entityId: entity.id,
        finalScore: 0,
        components: {
          lexical: 0,
          typeRelevance: 0,
          recency: 0,
          confidence: 0,
          accessFrequency: 0,
          fileRelevance: 0,
          graphNeighborhood: 0,
        },
        reasons: [],
      },
    }))
    .sort((a, b) => b.score.finalScore - a.score.finalScore);
};
