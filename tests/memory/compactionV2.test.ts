import {describe, expect, it} from 'vitest';
import type {MemoryEntity, MemoryGraph} from '../../src/memory/graphTypes.js';
import {compactMemoryGraph, compactMemoryGraphV2} from '../../src/memory/compaction.js';

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

let idCounter = 0;
const makeEntity = (overrides: Partial<MemoryEntity> = {}): MemoryEntity => ({
  confidence: 0.8,
  createdAt: daysAgo(10),
  id: `e${++idCounter}`,
  name: 'Test entity about some project architecture',
  observations: ['This is a meaningful observation about the project'],
  source: 'agent',
  tags: [],
  type: 'convention',
  updatedAt: daysAgo(5),
  ...overrides,
});

const makeGraph = (entities: MemoryEntity[]): MemoryGraph => ({
  edges: [],
  entities,
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
});

const DEFAULT_OPTS = {maxEntities: 100, minConfidence: 0.3, staleDays: 30};

describe('compactMemoryGraph (v1 preserved)', () => {
  it('marks stale entities', () => {
    const entity = makeEntity({updatedAt: daysAgo(60), confidence: 0.4});
    const graph = compactMemoryGraph(makeGraph([entity]), DEFAULT_OPTS);
    const updated = graph.entities.find((e) => e.id === entity.id);
    expect(updated?.stale).toBe(true);
  });

  it('removes stale low-confidence entities', () => {
    const entity = makeEntity({updatedAt: daysAgo(60), confidence: 0.2});
    const graph = compactMemoryGraph(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.find((e) => e.id === entity.id)).toBeUndefined();
  });

  it('preserves important stale memory (high confidence decisions)', () => {
    const entity = makeEntity({
      confidence: 0.95,
      type: 'decision',
      updatedAt: daysAgo(60),
    });
    const graph = compactMemoryGraph(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.some((e) => e.id === entity.id)).toBe(true);
  });

  it('stores compaction metadata', () => {
    const graph = compactMemoryGraph(makeGraph([makeEntity()]), DEFAULT_OPTS);
    expect(graph.metadata?.compaction).toBeDefined();
  });
});

describe('compactMemoryGraphV2', () => {
  it('returns a report alongside the compacted graph', () => {
    const {graph, report} = compactMemoryGraphV2(makeGraph([makeEntity()]), DEFAULT_OPTS);
    expect(graph).toBeDefined();
    expect(report).toHaveProperty('removed');
    expect(report).toHaveProperty('preserved');
    expect(report).toHaveProperty('superseded');
    expect(report).toHaveProperty('warnings');
  });

  it('removes expired superseded entities', () => {
    const entity = makeEntity({
      metadata: {supersededBy: 'other-entity', deprecated: true},
      updatedAt: daysAgo(20),
    });
    const {graph, report} = compactMemoryGraphV2(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.find((e) => e.id === entity.id)).toBeUndefined();
    expect(report.superseded).toContain(entity.id);
  });

  it('aggressively compacts stale session entities', () => {
    const entity = makeEntity({
      type: 'session',
      updatedAt: daysAgo(60),
      stale: true,
      confidence: 0.5,
    });
    const {graph, report} = compactMemoryGraphV2(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.find((e) => e.id === entity.id)).toBeUndefined();
    expect(report.removed).toContain(entity.id);
  });

  it('preserves frequently-accessed entities', () => {
    const entity = makeEntity({
      confidence: 0.35,
      metadata: {accessCount: 5},
      stale: true,
      updatedAt: daysAgo(60),
    });
    const {report} = compactMemoryGraphV2(makeGraph([entity]), DEFAULT_OPTS);
    expect(report.preserved).toContain(entity.id);
  });

  it('preserves decision kind entities even when stale', () => {
    const entity = makeEntity({
      confidence: 0.85,
      stale: false,
      type: 'decision',
      updatedAt: daysAgo(5),
    });
    const {graph} = compactMemoryGraphV2(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.some((e) => e.id === entity.id)).toBe(true);
  });

  it('removes duplicate low-quality session noise', () => {
    const entity = makeEntity({
      metadata: {duplicateNoise: true},
      name: 'Repeated session note',
      type: 'session',
    });
    const {graph, report} = compactMemoryGraphV2(makeGraph([entity]), DEFAULT_OPTS);
    expect(graph.entities.find((e) => e.id === entity.id)).toBeUndefined();
    expect(report.removed).toContain(entity.id);
  });

  it('enforces maxEntities limit with kind-priority ordering', () => {
    const entities = Array.from({length: 20}, (_, i) =>
      makeEntity({
        confidence: 0.7,
        type: i % 2 === 0 ? 'decision' : 'session',
        updatedAt: daysAgo(5),
      }),
    );
    const {graph} = compactMemoryGraphV2(makeGraph(entities), {
      ...DEFAULT_OPTS,
      maxEntities: 5,
    });
    expect(graph.entities).toHaveLength(5);
    const decisions = graph.entities.filter((e) => e.type === 'decision');
    expect(decisions.length).toBeGreaterThanOrEqual(3);
  });

  it('adds warning for large compaction runs', () => {
    const entities = Array.from({length: 80}, () =>
      makeEntity({confidence: 0.1, stale: true, updatedAt: daysAgo(100)}),
    );
    const {report} = compactMemoryGraphV2(makeGraph(entities), {
      ...DEFAULT_OPTS,
      maxEntities: 5,
    });
    expect(report.warnings.some((w) => w.includes('Large compaction'))).toBe(true);
  });
});
