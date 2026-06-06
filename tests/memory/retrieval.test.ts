import {describe, expect, it} from 'vitest';

import {
  computeTypeRelevance,
  computeRecencyScore,
  computeAccessFrequencyScore,
  computeFileRelevanceScore,
  computeGraphNeighborhoodScore,
  computeRetrievalScore,
  explainRelevantMemory,
} from '../../src/memory/retrieval.js';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';

const createEntity = (id: string, type: string = 'task', name: string = 'Test'): MemoryEntity => ({
  confidence: 0.8,
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  id,
  name,
  observations: ['test observation'],
  source: 'user',
  tags: ['test'],
  type: type as MemoryEntity['type'],
  updatedAt: new Date().toISOString(),
});

describe('Memory Retrieval Scoring', () => {
  describe('Type Relevance', () => {
    it('scores decision type highly', () => {
      expect(computeTypeRelevance('decision')).toBeGreaterThan(0.9);
    });

    it('scores convention type high', () => {
      expect(computeTypeRelevance('convention')).toBeGreaterThan(0.8);
    });

    it('scores session type low', () => {
      expect(computeTypeRelevance('session')).toBeLessThan(0.6);
    });

    it('defaults unknown types to 0.5', () => {
      expect(computeTypeRelevance('unknown_type')).toBe(0.5);
    });
  });

  describe('Recency Score', () => {
    it('gives max score for very recent entities', () => {
      const now = Date.now();
      const recent = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
      const score = computeRecencyScore(recent, recent, now);
      expect(score).toBeGreaterThan(0.9);
    });

    it('decreases score for older entities', () => {
      const now = Date.now();
      const old = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString();
      const score = computeRecencyScore(old, old, now);
      expect(score).toBeLessThan(0.7);
    });

    it('returns 0 for invalid dates', () => {
      expect(computeRecencyScore('invalid', 'invalid')).toBe(0);
    });
  });

  describe('Access Frequency Score', () => {
    it('scores entities with no access as 0', () => {
      const score = computeAccessFrequencyScore({});
      expect(score).toBe(0);
    });

    it('gives bonus for frequent access', () => {
      const score = computeAccessFrequencyScore({accessCount: 10});
      expect(score).toBeGreaterThan(0.05);
    });

    it('boosts score for recently accessed items', () => {
      const now = Date.now();
      const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      const score = computeAccessFrequencyScore({
        accessCount: 5,
        lastAccessedAt: recent,
      });
      expect(score).toBeGreaterThan(0.08);
    });
  });

  describe('File Relevance Score', () => {
    it('returns 0 when no files are mentioned', () => {
      const entity = createEntity('test');
      const score = computeFileRelevanceScore(entity, new Set());
      expect(score).toBe(0);
    });

    it('scores entity that mentions relevant file', () => {
      const entity: MemoryEntity = {
        ...createEntity('test'),
        name: 'src/index.ts strategy',
        observations: ['Important for src/index.ts handling'],
      };
      const files = new Set(['src/index.ts']);
      const score = computeFileRelevanceScore(entity, files);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Graph Neighborhood Score', () => {
    it('returns 0 when entity has no neighbors', () => {
      const entity = createEntity('entity1');
      const score = computeGraphNeighborhoodScore(entity, new Map(), [], 'query');
      expect(score).toBe(0);
    });

    it('scores entity with related neighbors higher', () => {
      const entity1 = createEntity('entity1', 'task', 'Main task');
      const entity2 = createEntity('entity2', 'decision', 'Related decision');
      const allEntities = new Map([
        [entity1.id, entity1],
        [entity2.id, entity2],
      ]);
      const relations = [{from: entity1.id, to: entity2.id}];
      const score = computeGraphNeighborhoodScore(entity1, allEntities, relations, 'decision');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Combined Retrieval Score', () => {
    it('produces score between 0 and 1', () => {
      const entity = createEntity('test');
      const score = computeRetrievalScore(entity, 0.5);
      expect(score.finalScore).toBeGreaterThanOrEqual(0);
      expect(score.finalScore).toBeLessThanOrEqual(1);
    });

    it('weights lexical score significantly', () => {
      const entity = createEntity('test');
      const highLexical = computeRetrievalScore(entity, 0.9);
      const lowLexical = computeRetrievalScore(entity, 0.1);
      expect(highLexical.finalScore).toBeGreaterThan(lowLexical.finalScore);
    });

    it('includes meaningful reasons', () => {
      const entity = createEntity('test', 'decision');
      const score = computeRetrievalScore(entity, 0.8);
      expect(score.reasons.length).toBeGreaterThan(0);
      expect(score.reasons[0]).toBeTruthy();
    });

    it('generates correct component scores', () => {
      const entity = createEntity('test');
      const score = computeRetrievalScore(entity, 0.6);
      expect(score.components.lexical).toBe(0.6);
      expect(score.components.confidence).toBeGreaterThan(0);
      expect(score.components.typeRelevance).toBeGreaterThan(0);
    });
  });

  describe('Memory Explanation', () => {
    it('sorts entities by final score', () => {
      const entity1 = createEntity('e1');
      const entity2 = createEntity('e2');
      const entity3 = createEntity('e3');

      const scores = new Map([
        [entity1.id, computeRetrievalScore(entity1, 0.3)],
        [entity2.id, computeRetrievalScore(entity2, 0.8)],
        [entity3.id, computeRetrievalScore(entity3, 0.5)],
      ]);

      const explained = explainRelevantMemory([entity1, entity2, entity3], scores);
      expect(explained[0]?.entity.id).toBe(entity2.id);
      expect(explained[1]?.entity.id).toBe(entity3.id);
      expect(explained[2]?.entity.id).toBe(entity1.id);
    });
  });
});
