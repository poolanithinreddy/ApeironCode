import {describe, expect, it} from 'vitest';

import {
  computeSpecificity,
  computeActionability,
  computeProjectRelevance,
  computePathReferences,
  computeRecencyPenalty,
  computeGenericityPenalty,
  computeSensitivityPenalty,
  computeMemoryQualityScore,
} from '../../src/memory/quality.js';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';

const createEntity = (name: string, observations: string[] = [], tags: string[] = []): MemoryEntity => ({
  confidence: 0.8,
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  id: 'test-id',
  name,
  observations,
  source: 'user',
  tags,
  type: 'task',
  updatedAt: new Date().toISOString(),
});

describe('Memory Quality Scoring', () => {
  describe('Specificity', () => {
    it('gives low score to very short text', () => {
      const entity = createEntity('Go');
      expect(computeSpecificity(entity)).toBeLessThan(0.5);
    });

    it('gives medium score to reasonable text', () => {
      const entity = createEntity('Run npm test to validate changes');
      expect(computeSpecificity(entity)).toBeGreaterThan(0.5);
      expect(computeSpecificity(entity)).toBeLessThan(0.9);
    });

    it('gives high score to detailed text', () => {
      const entity = createEntity(
        'Configure test runner',
        ['Run npm test to validate all changes. This executes both unit tests and integration tests to ensure nothing is broken.']
      );
      expect(computeSpecificity(entity)).toBeGreaterThan(0.7);
    });
  });

  describe('Actionability', () => {
    it('scores command types as actionable', () => {
      const entity: MemoryEntity = {
        ...createEntity('npm test'),
        type: 'command',
      };
      expect(computeActionability(entity)).toBeGreaterThan(0.6);
    });

    it('scores entities with action keywords higher', () => {
      const entity = createEntity('Run tests and deploy the application');
      expect(computeActionability(entity)).toBeGreaterThan(0.5);
    });

    it('gives low score to passive text', () => {
      const entity = createEntity('This is a thing that exists');
      expect(computeActionability(entity)).toBeLessThan(0.5);
    });
  });

  describe('Project Relevance', () => {
    it('scores project-memory tags as highly relevant', () => {
      const entity = createEntity('Architecture', ['test'], ['project-memory']);
      expect(computeProjectRelevance(entity)).toBe(1.0);
    });

    it('scores global-memory tags as less relevant', () => {
      const entity: MemoryEntity = {
        ...createEntity('Style', ['test'], ['global-memory']),
        type: 'user_preference',
      };
      expect(computeProjectRelevance(entity)).toBeLessThan(0.5);
    });

    it('scores session types as low relevance', () => {
      const entity: MemoryEntity = {
        ...createEntity('Session'),
        type: 'session',
      };
      expect(computeProjectRelevance(entity)).toBeLessThan(0.6);
    });
  });

  describe('Path References', () => {
    it('scores entities with file paths highly', () => {
      const entity = createEntity('src/index.ts implementation', ['Details in src/components/Button.tsx']);
      expect(computePathReferences(entity)).toBeGreaterThan(0.5);
    });

    it('scores entities without paths low', () => {
      const entity = createEntity('General notes');
      expect(computePathReferences(entity)).toBeLessThan(0.5);
    });
  });

  describe('Recency Penalty', () => {
    it('gives high score to recent entities', () => {
      const now = Date.now();
      const recent = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeRecencyPenalty(recent, recent, now)).toBeGreaterThan(0.9);
    });

    it('decreases score for older entities', () => {
      const now = Date.now();
      const old = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeRecencyPenalty(old, old, now)).toBeLessThan(0.7);
    });
  });

  describe('Genericity Penalty', () => {
    it('penalizes overly generic text', () => {
      const entity = createEntity('Remember this important stuff for the project code');
      expect(computeGenericityPenalty(entity)).toBeGreaterThan(0.3);
    });

    it('doesn\'t penalize specific text', () => {
      const entity = createEntity('Configure TypeScript strict mode in tsconfig.json');
      expect(computeGenericityPenalty(entity)).toBeLessThan(0.3);
    });
  });

  describe('Sensitivity Penalty', () => {
    it('detects API keys', () => {
      const entity = createEntity('api_key: sk-1234567890abcdef');
      expect(computeSensitivityPenalty(entity)).toBeGreaterThan(0);
    });

    it('detects AWS credentials', () => {
      const entity = createEntity('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
      expect(computeSensitivityPenalty(entity)).toBeGreaterThan(0);
    });

    it('detects GitHub tokens', () => {
      const entity = createEntity('token: ghp_1234567890abcdefghijklmnopqrstuv');
      expect(computeSensitivityPenalty(entity)).toBeGreaterThan(0);
    });

    it('doesn\'t penalize normal text', () => {
      const entity = createEntity('Configure the build process');
      expect(computeSensitivityPenalty(entity)).toBe(0);
    });
  });

  describe('Overall Quality Score', () => {
    it('produces score between 0 and 1', () => {
      const entity = createEntity('Test entity', ['with observation']);
      const score = computeMemoryQualityScore(entity);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    });

    it('marks good quality memory', () => {
      const entity: MemoryEntity = {
        ...createEntity('Run npm test in src/components', ['Validates all TypeScript and JSX files']),
        type: 'command',
        confidence: 0.9,
        tags: ['project-memory'],
      };
      const score = computeMemoryQualityScore(entity);
      expect(score.isGood).toBe(true);
    });

    it('identifies problematic memory', () => {
      const entity = createEntity('api_key: sk-test-key-12345');
      const score = computeMemoryQualityScore(entity);
      expect(score.issues.length).toBeGreaterThan(0);
      expect(score.issues[0]).toContain('sensitive');
    });

    it('identifies generic memory', () => {
      const entity = createEntity('Remember this important stuff');
      const score = computeMemoryQualityScore(entity);
      expect(score.issues.some(i => i.includes('generic'))).toBe(true);
    });
  });
});
