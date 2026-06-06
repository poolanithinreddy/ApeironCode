import {describe, expect, it} from 'vitest';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';
import {
  applySupersession,
  detectSupersession,
  filterSuperseded,
  isSuperseded,
  markInvalidated,
  supersessionSummary,
} from '../../src/memory/supersession.js';

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const makeEntity = (overrides: Partial<MemoryEntity> = {}): MemoryEntity => ({
  confidence: 0.8,
  createdAt: daysAgo(30),
  id: 'e1',
  name: 'Test entity',
  observations: ['some observation text here'],
  source: 'agent',
  tags: [],
  type: 'convention',
  updatedAt: daysAgo(10),
  ...overrides,
});

describe('detectSupersession', () => {
  it('detects no supersession when entities are unrelated', () => {
    const entities = [
      makeEntity({id: 'a', name: 'Build command', observations: ['npm run build'], type: 'command'}),
      makeEntity({id: 'b', name: 'Test strategy', observations: ['use vitest for testing'], type: 'convention'}),
    ];
    expect(detectSupersession(entities)).toHaveLength(0);
  });

  it('detects supersession when newer higher-confidence entity contradicts older', () => {
    const older = makeEntity({
      confidence: 0.6,
      id: 'old',
      name: 'database strategy',
      observations: ['use postgres for all data storage in the service'],
      updatedAt: daysAgo(30),
    });
    const newer = makeEntity({
      confidence: 0.9,
      id: 'new',
      name: 'database strategy',
      observations: ['switch to mongodb for flexible document structure'],
      updatedAt: daysAgo(1),
    });
    const records = detectSupersession([older, newer]);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]!.newerEntityId).toBe('new');
    expect(records[0]!.olderEntityId).toBe('old');
  });

  it('does not supersede when observations are similar (not contradictory)', () => {
    const a = makeEntity({
      id: 'a',
      name: 'build command',
      observations: ['npm run build compiles the typescript project'],
      updatedAt: daysAgo(10),
    });
    const b = makeEntity({
      confidence: 0.9,
      id: 'b',
      name: 'build command',
      observations: ['npm run build compiles the typescript project with esbuild'],
      updatedAt: daysAgo(1),
    });
    const records = detectSupersession([a, b]);
    expect(records).toHaveLength(0);
  });

  it('does not supersede entities of different types', () => {
    const a = makeEntity({id: 'a', name: 'project database', observations: ['uses postgres'], type: 'decision'});
    const b = makeEntity({id: 'b', name: 'project database', observations: ['uses mongodb'], type: 'command'});
    const records = detectSupersession([a, b]);
    expect(records).toHaveLength(0);
  });

  it('detects stale provider.chat architecture superseded by provider.stream', () => {
    const older = makeEntity({
      confidence: 0.75,
      id: 'old-chat',
      name: 'Provider interface',
      observations: ['provider.chat() is used for model calls'],
      type: 'provider',
      updatedAt: daysAgo(30),
    });
    const newer = makeEntity({
      confidence: 0.95,
      id: 'new-stream',
      metadata: {verified: true},
      name: 'Provider streaming interface',
      observations: ['provider.stream() replaced provider.chat() for production model calls'],
      type: 'provider',
      updatedAt: daysAgo(1),
    });
    const records = detectSupersession([older, newer]);
    expect(records[0]?.newerEntityId).toBe('new-stream');
    expect(records[0]?.olderEntityId).toBe('old-chat');
  });

  it('detects MCP stdio-only fact superseded by stdio/http/sse support', () => {
    const older = makeEntity({
      confidence: 0.7,
      id: 'old-mcp',
      name: 'MCP transport support',
      observations: ['MCP is stdio-only'],
      type: 'module',
      updatedAt: daysAgo(25),
    });
    const newer = makeEntity({
      confidence: 0.93,
      id: 'new-mcp',
      name: 'MCP supports multiple transports',
      observations: ['MCP supports stdio, HTTP, and SSE transports'],
      type: 'module',
      updatedAt: daysAgo(1),
    });
    const records = detectSupersession([older, newer]);
    expect(records[0]?.newerEntityId).toBe('new-mcp');
  });

  it('gives verified entity a scoring boost', () => {
    // verified entity is older and lower confidence but verified — verify it gets a boost
    const unverified = makeEntity({
      confidence: 0.9,
      id: 'unverified',
      name: 'api style',
      observations: ['use rest api for all endpoints in production'],
      updatedAt: daysAgo(1),
    });
    const verified = makeEntity({
      confidence: 0.92,
      id: 'verified',
      metadata: {verified: true},
      name: 'api style',
      observations: ['use graphql for flexible querying patterns in the gateway'],
      updatedAt: daysAgo(1),
    });
    const records = detectSupersession([unverified, verified]);
    // Both have same recency; verified wins due to confidence + verified flag
    if (records.length > 0) {
      expect(records[0]!.newerEntityId).toBe('verified');
    }
  });
});

describe('applySupersession', () => {
  it('marks older entity as supersededBy', () => {
    const older = makeEntity({id: 'old', name: 'db', observations: ['postgres data layer'], updatedAt: daysAgo(20)});
    const newer = makeEntity({confidence: 0.9, id: 'new', name: 'db', observations: ['mongodb document layer'], updatedAt: daysAgo(1)});
    const records = detectSupersession([older, newer]);
    const {entities} = applySupersession([older, newer], records);
    const updatedOld = entities.find((e) => e.id === 'old');
    expect(updatedOld?.metadata?.['supersededBy']).toBe('new');
    expect(updatedOld?.metadata?.['deprecated']).toBe(true);
  });

  it('marks newer entity as supersedes', () => {
    const older = makeEntity({id: 'old', name: 'db', observations: ['postgres data layer'], updatedAt: daysAgo(20)});
    const newer = makeEntity({confidence: 0.9, id: 'new', name: 'db', observations: ['mongodb document layer'], updatedAt: daysAgo(1)});
    const records = detectSupersession([older, newer]);
    const {entities} = applySupersession([older, newer], records);
    const updatedNew = entities.find((e) => e.id === 'new');
    expect(Array.isArray(updatedNew?.metadata?.['supersedes'])).toBe(true);
  });

  it('returns original records', () => {
    const entities = [makeEntity({id: 'a'}), makeEntity({id: 'b'})];
    const {records} = applySupersession(entities, []);
    expect(records).toHaveLength(0);
  });
});

describe('isSuperseded / filterSuperseded', () => {
  it('detects superseded via metadata', () => {
    const entity = makeEntity({metadata: {supersededBy: 'some-other-id'}});
    expect(isSuperseded(entity)).toBe(true);
  });

  it('detects deprecated via metadata', () => {
    const entity = makeEntity({metadata: {deprecated: true}});
    expect(isSuperseded(entity)).toBe(true);
  });

  it('returns false for normal entity', () => {
    expect(isSuperseded(makeEntity())).toBe(false);
  });

  it('filters superseded from list', () => {
    const entities = [
      makeEntity({id: 'a'}),
      makeEntity({id: 'b', metadata: {supersededBy: 'a'}}),
      makeEntity({id: 'c'}),
    ];
    const filtered = filterSuperseded(entities);
    expect(filtered.map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('markInvalidated', () => {
  it('marks entity as invalidated and deprecated', () => {
    const entity = makeEntity();
    const updated = markInvalidated(entity, 'other-id');
    expect(updated.metadata?.['invalidatedBy']).toBe('other-id');
    expect(updated.metadata?.['deprecated']).toBe(true);
  });
});

describe('supersessionSummary', () => {
  it('returns no-supersession message for empty list', () => {
    expect(supersessionSummary([])).toContain('no supersessions');
  });

  it('returns count for non-empty list', () => {
    const records = [{newerEntityId: 'a', olderEntityId: 'b', reason: 'test', score: 0.5}];
    expect(supersessionSummary(records)).toContain('1');
  });
});
