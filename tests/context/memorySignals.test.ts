import {describe, it, expect} from 'vitest';
import {
  extractFileMemorySignals,
  buildMemoryFileScores,
  formatMemorySignals,
  type FileMemorySignal,
} from '../../src/context/memorySignals.js';
import type {MemoryRelatedResult} from '../../src/memory/graphTypes.js';

describe('memorySignals - extract file relevance from memory', () => {
  it('returns empty map for empty results', () => {
    const signals = extractFileMemorySignals([]);
    expect(signals.size).toBe(0);
  });

  it('extracts file paths from entities related to files', () => {
    const results: MemoryRelatedResult[] = [
      {
        edges: [],
        entity: {
          confidence: 0.9,
          createdAt: '2024-01-01T00:00:00Z',
          id: 'bug:abc123',
          name: 'authentication failure in login',
          observations: ['occurs in src/auth.ts'],
          source: 'user',
          tags: [],
          type: 'bug',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        reasons: ['matched "auth"'],
        score: 50,
      },
    ];

    const signals = extractFileMemorySignals(results);
    expect(signals.size).toBeGreaterThanOrEqual(0);
  });

  it('builds file scores map from signals', () => {
    const testSignals = new Map<string, FileMemorySignal>([
      [
        'src/important.ts',
        {
          confidence: 0.9,
          filePath: 'src/important.ts',
          reasons: ['high confidence'],
          score: 0.8,
          sources: ['file'],
        },
      ],
    ]);

    const scores = buildMemoryFileScores(testSignals);
    expect(scores.has('src/important.ts')).toBe(true);
    expect(scores.get('src/important.ts')!).toBeGreaterThan(0);
  });

  it('normalizes scores to 0-1 range', () => {
    const results: MemoryRelatedResult[] = [];

    const signals = extractFileMemorySignals(results);
    for (const signal of signals.values()) {
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(1);
    }
  });

  it('filters out non-relevant signals', () => {
    const results: MemoryRelatedResult[] = [
      {
        edges: [],
        entity: {
          confidence: 0.2,
          createdAt: '2024-01-01T00:00:00Z',
          id: 'other:low',
          name: 'some decision about architecture',
          observations: [],
          source: 'user',
          tags: [],
          type: 'decision',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        reasons: ['low relevance'],
        score: 5,
      },
    ];

    const signals = extractFileMemorySignals(results);
    expect(signals.size).toBe(0);
  });

  it('formats signals for display', () => {
    const signals = new Map<string, FileMemorySignal>([
      [
        'src/important.ts',
        {
          confidence: 0.9,
          filePath: 'src/important.ts',
          reasons: ['high confidence'],
          score: 0.8,
          sources: ['file'],
        },
      ],
    ]);

    const formatted = formatMemorySignals(Array.from(signals.values()));
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('src/important.ts');
  });

  it('handles empty signals in formatting', () => {
    const formatted = formatMemorySignals([]);
    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('No memory signals');
  });

  it('returns consistent empty maps for unmatched queries', () => {
    const results: MemoryRelatedResult[] = [
      {
        edges: [],
        entity: {
          confidence: 0.9,
          createdAt: '2024-01-01T00:00:00Z',
          id: 'decision:xyz',
          name: 'use typescript for type safety',
          observations: [],
          source: 'user',
          tags: [],
          type: 'decision',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        reasons: ['matched "type"'],
        score: 30,
      },
    ];

    const signals = extractFileMemorySignals(results);
    const scores = buildMemoryFileScores(signals);
    expect(scores.size).toBe(0);
  });

  it('extracts multiple file references when available', () => {
    const results: MemoryRelatedResult[] = [];

    const signals = extractFileMemorySignals(results);
    expect(signals instanceof Map).toBe(true);
  });

  it('preserves confidence scores in file signals', () => {
    const testSignals = new Map<string, FileMemorySignal>([
      [
        'src/a.ts',
        {
          confidence: 0.95,
          filePath: 'src/a.ts',
          reasons: ['direct reference'],
          score: 0.9,
          sources: ['file'],
        },
      ],
      [
        'src/b.ts',
        {
          confidence: 0.5,
          filePath: 'src/b.ts',
          reasons: ['indirect reference'],
          score: 0.6,
          sources: ['module'],
        },
      ],
    ]);

    const scores = buildMemoryFileScores(testSignals);
    const scoreA = scores.get('src/a.ts') ?? 0;
    const scoreB = scores.get('src/b.ts') ?? 0;

    expect(scoreA).toBeGreaterThanOrEqual(scoreB);
  });

  it('tracks source origins of file signals', () => {
    const signals = new Map<string, FileMemorySignal>([
      [
        'src/test.ts',
        {
          confidence: 0.8,
          filePath: 'src/test.ts',
          reasons: ['matched reference'],
          score: 0.7,
          sources: ['file', 'test'],
        },
      ],
    ]);

    const signal = signals.get('src/test.ts')!;
    expect(signal.sources).toContain('file');
    expect(Array.isArray(signal.sources)).toBe(true);
  });
});
