import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {upsertMemoryFact, reviewMemoryGraph, pruneMemoryGraph} from '../../src/memory/graph.js';
import {forgetSessionMemories, formatMemoryFindings, formatMemorySourceTrace, rollbackMemoryItem} from '../../src/memory/control.js';
import {formatMemoryGraphSummary} from '../../src/memory/graphFormat.js';
import {searchMemoryGraph} from '../../src/memory/graphSearch.js';
import {MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('memory graph', () => {
  it('deduplicates facts, redacts secrets, searches, and persists', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-'));
    const store = new MemoryGraphStore(cwd);
    let graph = await store.load();

    graph = upsertMemoryFact(graph, {
      name: 'Auth module',
      observation: 'JWT_SECRET=super-secret applies to auth',
      source: 'user',
      type: 'module',
    });
    graph = upsertMemoryFact(graph, {
      name: 'Auth module',
      observation: 'Prefer session tests for auth regressions',
      source: 'agent',
      type: 'module',
    });

    await store.save(graph);
    const loaded = await store.load();
    expect(loaded.entities).toHaveLength(1);
    expect(loaded.entities[0]?.observations.join('\n')).toContain('[REDACTED_SECRET]');
    expect(searchMemoryGraph(loaded, 'auth session tests')[0]?.entity.name).toBe('Auth module');
    expect(formatMemoryGraphSummary(loaded)).toContain('Entities: 1');
  });

  it('reviews stale memories and prunes them', () => {
    const graph = upsertMemoryFact({
      edges: [],
      entities: [],
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    }, {
      name: 'Old provider',
      observation: 'Use old provider',
      type: 'provider',
    });
    const stale = {
      ...graph,
      entities: graph.entities.map((entity) => ({...entity, stale: true})),
    };
    expect(reviewMemoryGraph(stale).some((finding) => finding.type === 'stale')).toBe(true);
    expect(pruneMemoryGraph(stale).entities).toHaveLength(0);
    expect(formatMemoryFindings('Stale Memories', reviewMemoryGraph(stale))).toContain('Old provider');
  });

  it('traces, rolls back, and forgets session-linked memories with confirmation', () => {
    let graph = upsertMemoryFact({
      edges: [],
      entities: [],
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    }, {
      metadata: {sessionId: 'sess_1'},
      name: 'Session lesson',
      observation: 'sess_1 learned to run targeted tests',
      source: 'session',
      type: 'session',
    });
    const id = graph.entities[0]!.id;

    expect(formatMemorySourceTrace(graph, [], id)).toContain('Session lesson');
    expect(rollbackMemoryItem(graph, id, false).changed).toBe(false);
    const rolledBack = rollbackMemoryItem(graph, id, true);
    expect(rolledBack.changed).toBe(true);
    expect(rolledBack.graph.entities).toHaveLength(0);

    graph = upsertMemoryFact(graph, {
      metadata: {sessionId: 'sess_1'},
      name: 'Another session fact',
      observation: 'linked to sess_1',
      source: 'session',
      type: 'decision',
    });
    const forgotten = forgetSessionMemories(graph, 'sess_1', true);
    expect(forgotten.changed).toBe(true);
    expect(forgotten.graph.entities).toHaveLength(0);
  });
});
