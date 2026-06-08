import type {MemoryEntity} from './graphTypes.js';
import {containsSecretLikeContent, detectSecretLikeContent} from './safety.js';

export interface MemoryQualityScore {
  entityId: string;
  score: number; // 0-1
  signals: {
    specificity: number;
    actionability: number;
    projectRelevance: number;
    pathReferences: number;
    recency: number;
    confidence: number;
    genericityPenalty: number;
    sensitivityPenalty: number;
  };
  issues: string[];
  isGood: boolean;
}

const GENERIC_PHRASES = new Set([
  'important',
  'remember',
  'note',
  'stuff',
  'things',
  'code',
  'project',
  'file',
  'feature',
  'bug',
  'issue',
  'todo',
  'fix',
]);

export const computeSpecificity = (entity: MemoryEntity): number => {
  const name = entity.name.length;
  const observations = (entity.observations ?? []).reduce((sum, obs) => sum + obs.length, 0);
  const combined = name + observations;

  if (combined < 20) {
    return 0.3;
  }
  if (combined < 50) {
    return 0.65;
  }
  if (combined < 200) {
    return 0.8;
  }
  return 1.0;
};

export const computeActionability = (entity: MemoryEntity): number => {
  const text = `${entity.name} ${entity.observations.join(' ')} ${entity.tags.join(' ')}`.toLowerCase();

  const actionableKeywords = ['run', 'use', 'apply', 'implement', 'execute', 'test', 'build', 'deploy', 'check', 'verify', 'enable', 'disable'];
  const matchedKeywords = actionableKeywords.filter(kw => text.includes(kw)).length;

  if (entity.type === 'command' || entity.type === 'decision' || entity.type === 'fix') {
    return matchedKeywords > 0 ? 0.75 : 0.7;
  }

  if (matchedKeywords >= 2) {
    return 0.9;
  }
  if (matchedKeywords === 1) {
    return 0.6;
  }

  return 0.3;
};

export const computeProjectRelevance = (entity: MemoryEntity): number => {
  if (entity.tags.includes('project-memory')) {
    return 1.0;
  }
  if (entity.type === 'session' || entity.type === 'symbol') {
    return 0.5;
  }
  if (entity.tags.includes('global-memory')) {
    return 0.4;
  }
  return 0.6;
};

export const computePathReferences = (entity: MemoryEntity): number => {
  const text = `${entity.name} ${entity.observations.join(' ')}`;
  const slashCount = (text.match(/\//g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;

  if (slashCount >= 2 || dotCount >= 3) {
    return 1.0;
  }
  if (slashCount >= 1 || dotCount >= 1) {
    return 0.6;
  }
  return 0.2;
};

export const computeRecencyPenalty = (
  createdAt: string,
  updatedAt: string,
  now: number = Date.now(),
): number => {
  const timestamp = updatedAt ? Date.parse(updatedAt) : Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1000));

  if (ageDays <= 30) {
    return 1.0;
  }
  if (ageDays <= 90) {
    return 0.8;
  }
  if (ageDays <= 180) {
    return 0.6;
  }
  return 0.4;
};

export const computeGenericityPenalty = (entity: MemoryEntity): number => {
  const text = `${entity.name} ${entity.observations.join(' ')}`.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) {
    return 0.8;
  }

  const genericCount = words.filter(w => GENERIC_PHRASES.has(w)).length;
  const ratio = genericCount / words.length;

  if (ratio > 0.5) {
    return 0.7;
  }
  if (ratio > 0.25) {
    return 0.5;
  }
  return 0;
};

export const computeSensitivityPenalty = (entity: MemoryEntity): number => {
  const text = `${entity.name} ${entity.observations.join(' ')} ${JSON.stringify(entity.metadata ?? {})}`;
  const matches = detectSecretLikeContent(text).length;

  if (matches > 2) {
    return 1.0;
  }
  if (matches > 0) {
    return 0.5;
  }
  return 0;
};

export const computeMemoryQualityScore = (
  entity: MemoryEntity,
  now: number = Date.now(),
): MemoryQualityScore => {
  const signals = {
    specificity: computeSpecificity(entity),
    actionability: computeActionability(entity),
    projectRelevance: computeProjectRelevance(entity),
    pathReferences: computePathReferences(entity),
    recency: computeRecencyPenalty(entity.createdAt, entity.updatedAt, now),
    confidence: entity.confidence,
    genericityPenalty: 1 - computeGenericityPenalty(entity),
    sensitivityPenalty: 1 - computeSensitivityPenalty(entity),
  };

  const weights = {
    specificity: 0.15,
    actionability: 0.15,
    projectRelevance: 0.15,
    pathReferences: 0.1,
    recency: 0.15,
    confidence: 0.1,
    genericityPenalty: 0.1,
    sensitivityPenalty: 0.15,
  };

  const score = Object.entries(signals).reduce((sum, [key, value]) => {
    return sum + (value * weights[key as keyof typeof weights]);
  }, 0);

  const issues: string[] = [];

  if (containsSecretLikeContent(`${entity.name} ${entity.observations.join(' ')} ${JSON.stringify(entity.metadata ?? {})}`)) {
    issues.push('Contains sensitive/secret-like content');
  }
  if (signals.genericityPenalty < 0.5) {
    issues.push('Too generic, lacks specificity');
  }
  if (signals.specificity < 0.3) {
    issues.push('Too short to be useful');
  }
  if (signals.actionability < 0.3) {
    issues.push('Not actionable');
  }
  if (signals.recency < 0.5) {
    issues.push('Potentially stale');
  }

  return {
    entityId: entity.id,
    score: Math.max(0, Math.min(1, score)),
    signals,
    issues,
    isGood: score > 0.6 && issues.length === 0,
  };
};
