import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {compactMemoryGraph} from '../../src/memory/compaction.js';
import {createEmptyMemoryGraph, MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('memory compaction', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
  });

  it('removes stale low-confidence entities and orphaned edges while preserving stronger facts', () => {
    const old = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)).toISOString();
    const now = new Date().toISOString();
    const graph = {
      ...createEmptyMemoryGraph(),
      edges: [
        {
          confidence: 0.7,
          createdAt: old,
          from: 'old',
          id: 'edge-1',
          source: 'user' as const,
          to: 'keep',
          type: 'session_modified_file' as const,
          updatedAt: old,
        },
      ],
      entities: [
        {
          confidence: 0.2,
          createdAt: old,
          id: 'old',
          name: 'Old auth note',
          observations: ['Old auth note'],
          source: 'user' as const,
          tags: [],
          type: 'module' as const,
          updatedAt: old,
        },
        {
          confidence: 0.95,
          createdAt: old,
          id: 'keep',
          name: 'High confidence auth note',
          observations: ['Still relevant'],
          source: 'user' as const,
          tags: [],
          type: 'module' as const,
          updatedAt: now,
        },
      ],
    };

    const compacted = compactMemoryGraph(graph, {
      maxEntities: 10,
      minConfidence: 0.7,
      staleDays: 30,
    });

    expect(compacted.entities.map((entity) => entity.id)).toEqual(['keep']);
    expect(compacted.edges).toHaveLength(0);
    expect(compacted.metadata?.compaction?.removedEntities).toBe(1);
  });

  it('enforces maxEntities by dropping the lowest-ranked entities', () => {
    const now = new Date().toISOString();
    const graph = {
      ...createEmptyMemoryGraph(),
      entities: [
        {
          confidence: 0.9,
          createdAt: now,
          id: 'high',
          name: 'High',
          observations: ['High'],
          source: 'user' as const,
          tags: [],
          type: 'module' as const,
          updatedAt: now,
        },
        {
          confidence: 0.8,
          createdAt: now,
          id: 'mid',
          name: 'Mid',
          observations: ['Mid'],
          source: 'user' as const,
          tags: [],
          type: 'module' as const,
          updatedAt: now,
        },
        {
          confidence: 0.3,
          createdAt: now,
          id: 'low',
          name: 'Low',
          observations: ['Low'],
          source: 'user' as const,
          tags: [],
          type: 'module' as const,
          updatedAt: now,
        },
      ],
    };

    const compacted = compactMemoryGraph(graph, {
      maxEntities: 2,
      minConfidence: 0.1,
      staleDays: 365,
    });

    expect(compacted.entities.map((entity) => entity.id)).toEqual(['high', 'mid']);
  });

  it('auto-compacts oversized graphs on save', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-compact-'));
    directories.push(cwd);
    const store = new MemoryGraphStore(cwd);
    const now = new Date().toISOString();
    const oversized = {
      ...createEmptyMemoryGraph(),
      entities: Array.from({length: 1005}, (_, index) => ({
        confidence: 0.5 + ((1005 - index) / 5000),
        createdAt: now,
        id: `entity-${index}`,
        name: `Entity ${index}`,
        observations: [`Observation ${index}`],
        source: 'user' as const,
        tags: [],
        type: 'module' as const,
        updatedAt: now,
      })),
    };

    const saved = await store.save(oversized);

    expect(saved.entities.length).toBeLessThanOrEqual(1000);
    expect(saved.metadata?.compaction?.appliedAt).toBeDefined();
  });

  it('preserves old high-confidence architecture facts while pruning weak stale notes', () => {
    const old = new Date(Date.now() - (240 * 24 * 60 * 60 * 1000)).toISOString();
    const graph = {
      ...createEmptyMemoryGraph(),
      entities: [
        {
          confidence: 0.95,
          createdAt: old,
          id: 'architecture',
          name: 'Provider architecture decision',
          observations: ['Project uses provider.stream() instead of provider.chat() after Phase 1 in src/agent/Agent.ts.'],
          source: 'user' as const,
          tags: ['project-memory'],
          type: 'decision' as const,
          updatedAt: old,
        },
        {
          confidence: 0.4,
          createdAt: old,
          id: 'generic',
          name: 'Remember stuff',
          observations: ['This is important'],
          source: 'user' as const,
          tags: [],
          type: 'task' as const,
          updatedAt: old,
        },
      ],
    };

    const compacted = compactMemoryGraph(graph, {
      maxEntities: 10,
      minConfidence: 0.7,
      staleDays: 45,
    });

    expect(compacted.entities.map((entity) => entity.id)).toContain('architecture');
    expect(compacted.entities.map((entity) => entity.id)).not.toContain('generic');
    expect(compacted.entities.find((entity) => entity.id === 'architecture')?.stale).toBeFalsy();
  });
});
