import {describe, expect, it} from 'vitest';
import {
  getMemoryKindSpec,
  inferKindFromEntityType,
  isMemoryExpired,
  isMemoryKind,
  isMemoryStale,
  MEMORY_KIND_SPECS,
} from '../../src/memory/taxonomy.js';

describe('getMemoryKindSpec', () => {
  it('returns correct spec for user_preference', () => {
    const spec = getMemoryKindSpec('user_preference');
    expect(spec.kind).toBe('user_preference');
    expect(spec.defaultScope).toBe('global');
    expect(spec.injection).toBe('always');
    expect(spec.defaultTtlDays).toBeNull();
    expect(spec.defaultConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('returns correct spec for session_summary', () => {
    const spec = getMemoryKindSpec('session_summary');
    expect(spec.defaultScope).toBe('session');
    expect(spec.injection).toBe('manual');
    expect(spec.defaultTtlDays).not.toBeNull();
  });

  it('returns correct spec for fix_recipe', () => {
    const spec = getMemoryKindSpec('fix_recipe');
    expect(spec.injection).toBe('on_relevance');
    expect(spec.defaultTtlDays).not.toBeNull();
    expect(spec.staleAfterDays).not.toBeNull();
  });

  it('all kinds have complete specs', () => {
    for (const spec of MEMORY_KIND_SPECS) {
      expect(spec.kind).toBeTruthy();
      expect(spec.description).toBeTruthy();
      expect(spec.examples.length).toBeGreaterThan(0);
      expect(typeof spec.defaultConfidence).toBe('number');
    }
  });
});

describe('isMemoryKind', () => {
  it('accepts valid kinds', () => {
    expect(isMemoryKind('user_preference')).toBe(true);
    expect(isMemoryKind('decision')).toBe(true);
    expect(isMemoryKind('pitfall')).toBe(true);
    expect(isMemoryKind('session_summary')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isMemoryKind('unknown')).toBe(false);
    expect(isMemoryKind('')).toBe(false);
    expect(isMemoryKind('DECISION')).toBe(false);
  });
});

describe('inferKindFromEntityType', () => {
  it('maps known entity types to expected kinds', () => {
    expect(inferKindFromEntityType('command')).toBe('command');
    expect(inferKindFromEntityType('convention')).toBe('convention');
    expect(inferKindFromEntityType('decision')).toBe('decision');
    expect(inferKindFromEntityType('fix')).toBe('fix_recipe');
    expect(inferKindFromEntityType('user_preference')).toBe('user_preference');
    expect(inferKindFromEntityType('bug')).toBe('pitfall');
    expect(inferKindFromEntityType('error')).toBe('pitfall');
    expect(inferKindFromEntityType('session')).toBe('session_summary');
  });

  it('falls back to project_fact for unmapped types', () => {
    expect(inferKindFromEntityType('file')).toBe('project_fact');
    expect(inferKindFromEntityType('module')).toBe('project_fact');
    expect(inferKindFromEntityType('task')).toBe('project_fact');
  });
});

describe('isMemoryStale', () => {
  const daysAgo = (n: number): string => {
    const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    return d.toISOString();
  };

  it('returns false when well within the stale threshold', () => {
    expect(isMemoryStale('user_preference', daysAgo(10))).toBe(false);
    expect(isMemoryStale('decision', daysAgo(30))).toBe(false);
  });

  it('returns true when past stale threshold', () => {
    const spec = getMemoryKindSpec('fix_recipe');
    const staleAfter = spec.staleAfterDays!;
    expect(isMemoryStale('fix_recipe', daysAgo(staleAfter + 5))).toBe(true);
  });

  it('returns false when within stale threshold', () => {
    const spec = getMemoryKindSpec('fix_recipe');
    const staleAfter = spec.staleAfterDays!;
    expect(isMemoryStale('fix_recipe', daysAgo(staleAfter - 5))).toBe(false);
  });

  it('returns false for invalid date', () => {
    expect(isMemoryStale('pitfall', 'not-a-date')).toBe(false);
  });
});

describe('isMemoryExpired', () => {
  const daysAgo = (n: number): string =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('returns false when defaultTtlDays is null', () => {
    expect(isMemoryExpired('user_preference', daysAgo(1000))).toBe(false);
    expect(isMemoryExpired('convention', daysAgo(1000))).toBe(false);
  });

  it('returns true when past TTL', () => {
    const spec = getMemoryKindSpec('session_summary');
    const ttl = spec.defaultTtlDays!;
    expect(isMemoryExpired('session_summary', daysAgo(ttl + 1))).toBe(true);
  });

  it('returns false when within TTL', () => {
    const spec = getMemoryKindSpec('session_summary');
    const ttl = spec.defaultTtlDays!;
    expect(isMemoryExpired('session_summary', daysAgo(ttl - 1))).toBe(false);
  });
});
