import {describe, expect, it} from 'vitest';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';
import {
  applyLifecyclePolicies,
  boostAccessedMemory,
  demoteStaleMemory,
  promoteSessionMemory,
  recordAccess,
} from '../../src/memory/lifecycle.js';

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const makeEntity = (overrides: Partial<MemoryEntity> = {}): MemoryEntity => ({
  confidence: 0.8,
  createdAt: daysAgo(30),
  id: 'e1',
  name: 'Test entity',
  observations: ['some observation text'],
  source: 'agent',
  tags: [],
  type: 'convention',
  updatedAt: daysAgo(5),
  ...overrides,
});

describe('promoteSessionMemory', () => {
  it('does not promote non-session entities', () => {
    const entity = makeEntity({type: 'convention'});
    const {promoted} = promoteSessionMemory([entity]);
    expect(promoted).toHaveLength(0);
  });

  it('does not promote session entity with insufficient access count', () => {
    const entity = makeEntity({type: 'session', metadata: {accessCount: 1}});
    const {promoted} = promoteSessionMemory([entity]);
    expect(promoted).toHaveLength(0);
  });

  it('promotes verified session entity regardless of access count', () => {
    const entity = makeEntity({type: 'session', metadata: {verified: true, accessCount: 0}});
    const {promoted} = promoteSessionMemory([entity]);
    expect(promoted).toContain('e1');
  });

  it('promotes session entity with enough access count', () => {
    const entity = makeEntity({type: 'session', metadata: {accessCount: 3}});
    const {promoted, entities} = promoteSessionMemory([entity]);
    expect(promoted).toContain('e1');
    expect(entities[0]?.metadata?.['promotedFrom']).toBe('session');
  });

  it('respects custom promotionThreshold', () => {
    const entity = makeEntity({type: 'session', metadata: {accessCount: 2}});
    const {promoted: p1} = promoteSessionMemory([entity], {promotionThreshold: 5});
    const {promoted: p2} = promoteSessionMemory([entity], {promotionThreshold: 2});
    expect(p1).toHaveLength(0);
    expect(p2).toContain('e1');
  });
});

describe('demoteStaleMemory', () => {
  it('does not demote fresh entities', () => {
    const entity = makeEntity({updatedAt: daysAgo(1), type: 'convention'});
    const {demoted} = demoteStaleMemory([entity]);
    expect(demoted).toHaveLength(0);
  });

  it('marks stale entities as stale and lowers confidence', () => {
    // pitfall: staleAfterDays=120, defaultTtlDays=180. Use 150 days: stale but not expired.
    const entity = makeEntity({updatedAt: daysAgo(150), type: 'bug', confidence: 0.8});
    const {demoted, entities} = demoteStaleMemory([entity]);
    expect(demoted).toContain('e1');
    expect(entities[0]?.stale).toBe(true);
    expect(entities[0]?.confidence).toBeLessThan(0.8);
  });

  it('marks expired entities and adds expired metadata', () => {
    const entity = makeEntity({updatedAt: daysAgo(200), type: 'session', confidence: 0.7});
    const {expired, entities} = demoteStaleMemory([entity]);
    expect(expired).toContain('e1');
    expect(entities[0]?.metadata?.['expired']).toBe(true);
  });

  it('respects custom confidence penalty', () => {
    // Use 150 days so it's in stale path (not expired)
    const entity = makeEntity({updatedAt: daysAgo(150), type: 'bug', confidence: 0.8});
    const {entities} = demoteStaleMemory([entity], {staleConfidencePenalty: 0.2});
    expect(entities[0]?.confidence).toBeCloseTo(0.6, 1);
  });

  it('does not double-demote already-stale entities', () => {
    const entity = makeEntity({updatedAt: daysAgo(200), type: 'bug', stale: true, confidence: 0.5});
    const {demoted} = demoteStaleMemory([entity]);
    expect(demoted).toHaveLength(0);
  });
});

describe('boostAccessedMemory', () => {
  it('does not boost entity with zero access count', () => {
    const entity = makeEntity({metadata: {accessCount: 0}});
    const {boosted} = boostAccessedMemory([entity]);
    expect(boosted).toHaveLength(0);
  });

  it('boosts entity with high access count', () => {
    const entity = makeEntity({confidence: 0.7, metadata: {accessCount: 6}});
    const {boosted, entities} = boostAccessedMemory([entity]);
    expect(boosted).toContain('e1');
    expect(entities[0]?.confidence).toBeGreaterThan(0.7);
  });

  it('boosts verified entity', () => {
    const entity = makeEntity({confidence: 0.75, metadata: {verified: true}});
    const {boosted, entities} = boostAccessedMemory([entity]);
    expect(boosted).toContain('e1');
    expect(entities[0]?.confidence).toBeGreaterThan(0.75);
  });

  it('does not exceed confidence 1.0', () => {
    const entity = makeEntity({confidence: 0.99, metadata: {verified: true, accessCount: 10}});
    const {entities} = boostAccessedMemory([entity]);
    expect(entities[0]?.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe('recordAccess', () => {
  it('increments access count', () => {
    const entity = makeEntity({metadata: {accessCount: 2}});
    const updated = recordAccess(entity);
    expect(updated.metadata?.['accessCount']).toBe(3);
    expect(updated.metadata?.['lastAccessedAt']).toBeDefined();
  });

  it('starts from 0 if no prior accessCount', () => {
    const entity = makeEntity();
    const updated = recordAccess(entity);
    expect(updated.metadata?.['accessCount']).toBe(1);
  });
});

describe('applyLifecyclePolicies', () => {
  it('applies all policies and returns a report', () => {
    const entities = [
      makeEntity({id: 'a', type: 'convention', confidence: 0.8, updatedAt: daysAgo(200)}),
      makeEntity({id: 'b', type: 'session', metadata: {accessCount: 3}, updatedAt: daysAgo(1)}),
      makeEntity({id: 'c', confidence: 0.7, metadata: {verified: true}, updatedAt: daysAgo(1)}),
    ];
    const {report, entities: updated} = applyLifecyclePolicies(entities);
    expect(report).toHaveProperty('demoted');
    expect(report).toHaveProperty('promoted');
    expect(report).toHaveProperty('boosted');
    expect(report).toHaveProperty('expired');
    expect(updated).toHaveLength(3);
  });
});
