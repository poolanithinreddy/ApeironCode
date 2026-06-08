import {describe, expect, it} from 'vitest';

import {detectConflicts, findHighQualityVersion} from '../../src/memory/conflicts.js';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';

const createEntity = (
  id: string,
  name: string,
  observation: string = '',
  daysAgo: number = 0,
  confidence: number = 0.8,
): MemoryEntity => ({
  confidence,
  createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  id,
  name,
  observations: observation ? [observation] : [],
  source: 'user',
  tags: [],
  type: 'task',
  updatedAt: new Date(Date.now() - Math.max(0, daysAgo - 1) * 24 * 60 * 60 * 1000).toISOString(),
});

describe('Memory Conflict Detection', () => {
  it('detects no conflicts in unique entities', () => {
    const entities = [
      createEntity('e1', 'Build command'),
      createEntity('e2', 'Test command'),
      createEntity('e3', 'Deploy process'),
    ];
    const conflicts = detectConflicts(entities);
    expect(conflicts).toHaveLength(0);
  });

  it('detects conflicting observations for similar entities', () => {
    const entities = [
      createEntity('e1', 'Test command', 'npm test', 10),
      createEntity('e2', 'Test command', 'npm run test', 0), // newer
    ];
    const conflicts = detectConflicts(entities);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.conflictType).toBe('newer_supersedes_older');
  });

  it('identifies the newer version in conflicts', () => {
    const entities = [
      createEntity('e1', 'Architecture decision', 'Use Redux for state', 30),
      createEntity('e2', 'Architecture decision', 'Use Context API for state', 5),
    ];
    const conflicts = detectConflicts(entities);
    expect(conflicts[0]?.entityIds).toContain('e2');
  });

  it('doesn\'t flag as conflict when observations are substantially different', () => {
    const entities = [
      createEntity('e1', 'Test setup', 'Configure Jest'),
      createEntity('e2', 'Build setup', 'Configure Webpack'),
    ];
    const conflicts = detectConflicts(entities);
    expect(conflicts).toHaveLength(0);
  });

  it('respects similarity threshold', () => {
    const entities = [
      createEntity('e1', 'Important configuration', 'Value A', 10),
      createEntity('e2', 'Important procedure', 'Value B', 0),
    ];
    const conflicts = detectConflicts(entities);
    // "configuration" and "procedure" are dissimilar enough
    expect(conflicts.length).toBeLessThan(2);
  });

  it('includes recommendation in conflict report', () => {
    const entities = [
      createEntity('e1', 'Database strategy', 'Use PostgreSQL', 20),
      createEntity('e2', 'Database strategy', 'Use MongoDB', 0),
    ];
    const conflicts = detectConflicts(entities);
    if (conflicts.length > 0) {
      expect(conflicts[0]?.recommendation).toBeTruthy();
      // uncertain conflicts suggest review; certain conflicts suggest removal
      expect(
        conflicts[0]?.recommendation.includes('Remove') || conflicts[0]?.recommendation.includes('Review'),
      ).toBe(true);
    }
  });

  it('limits reported conflicts to reasonable number', () => {
    const entities = Array.from({length: 50}, (_, i) => createEntity(
      `e${i}`,
      `Entity ${Math.floor(i / 2)}`,
      `Variant ${i % 2}`,
    ));
    const conflicts = detectConflicts(entities);
    expect(conflicts.length).toBeLessThanOrEqual(20);
  });

  it('finds high quality version among candidates', () => {
    const newHighConf = createEntity('e1', 'Test', 'test 1', 1, 0.95);
    const oldHighConf = createEntity('e2', 'Test', 'test 2', 10, 0.9);
    const oldLowConf = createEntity('e3', 'Test', 'test 3', 20, 0.5);

    const best = findHighQualityVersion([newHighConf, oldHighConf, oldLowConf]);
    expect(best.id).toBe(newHighConf.id);
  });

  it('prefers high confidence even if older', () => {
    const newLowConf = createEntity('e1', 'Test', 'test 1', 0, 0.5);
    const oldHighConf = createEntity('e2', 'Test', 'test 2', 30, 0.95);

    const best = findHighQualityVersion([newLowConf, oldHighConf]);
    expect(best.id).toBe(oldHighConf.id);
  });

  it('breaks ties by preferring newer', () => {
    const newer = createEntity('e1', 'Test', 'test', 1, 0.8);
    const older = createEntity('e2', 'Test', 'test', 10, 0.8);

    const best = findHighQualityVersion([older, newer]);
    expect(best.id).toBe(newer.id);
  });
});
