import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {upsertMemoryFact} from '../../src/memory/graph.js';
import {createEmptyMemoryGraph, MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('MemoryGraphStore.search', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
  });

  it('returns semantically relevant entities and respects topK', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-search-'));
    directories.push(cwd);
    const store = new MemoryGraphStore(cwd);

    let graph = createEmptyMemoryGraph();
    graph = upsertMemoryFact(graph, {
      confidence: 0.8,
      name: 'Auth module',
      observation: 'Login regression tests usually fail here first.',
      source: 'user',
      type: 'module',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.92,
      name: 'npm test -- auth',
      observation: 'Runs targeted auth regression tests.',
      source: 'user',
      type: 'command',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.7,
      name: 'Docker backend',
      observation: 'Container isolation for sandbox execution.',
      source: 'user',
      type: 'module',
    });

    await store.save(graph);
    const results = await store.search('auth regression tests', {topK: 2});

    expect(results).toHaveLength(2);
    expect(results.map((entity) => entity.name)).toEqual(expect.arrayContaining(['Auth module', 'npm test -- auth']));
  });

  it('supports type and confidence filtering', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-search-'));
    directories.push(cwd);
    const store = new MemoryGraphStore(cwd);

    let graph = createEmptyMemoryGraph();
    graph = upsertMemoryFact(graph, {
      confidence: 0.95,
      name: 'npm test -- auth',
      observation: 'Runs auth tests.',
      source: 'user',
      type: 'command',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.4,
      name: 'Auth notes',
      observation: 'Background auth notes.',
      source: 'user',
      type: 'module',
    });

    await store.save(graph);

    const commandResults = await store.search('auth tests', {topK: 5, types: ['command']});
    const confidentResults = await store.search('auth', {minConfidence: 0.9, topK: 5});

    expect(commandResults).toHaveLength(1);
    expect(commandResults[0]?.type).toBe('command');
    expect(confidentResults).toHaveLength(1);
    expect(confidentResults[0]?.name).toBe('npm test -- auth');
  });

  it('applies recency and access bonuses when ranking similar matches', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-search-'));
    directories.push(cwd);
    const store = new MemoryGraphStore(cwd);

    let graph = createEmptyMemoryGraph();
    graph = upsertMemoryFact(graph, {
      confidence: 0.8,
      name: 'Parser bug note',
      observation: 'Parser retry bug hits malformed tool payloads.',
      source: 'user',
      type: 'bug',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.8,
      name: 'Parser retry guide',
      observation: 'Parser retry bug hits malformed tool payloads.',
      source: 'user',
      type: 'bug',
    });

    const now = new Date().toISOString();
    const old = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString();
    graph = {
      ...graph,
      entities: graph.entities.map((entity) => entity.name === 'Parser retry guide'
        ? {
            ...entity,
            metadata: {
              accessCount: 5,
              lastAccessedAt: now,
            },
            updatedAt: now,
          }
        : {
            ...entity,
            metadata: {
              accessCount: 0,
            },
            updatedAt: old,
          }),
    };

    await store.save(graph);
    const results = await store.searchWithScores('parser retry malformed payloads', {topK: 2});

    expect(results[0]?.entity.name).toBe('Parser retry guide');
    expect(results[0]?.score.components.accessFrequency).toBeGreaterThan(0);
    expect(results[0]?.score.reasons).toContain('used recently or often');
  });

  it('returns explainable hybrid scores with file and graph-neighborhood reasons', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-search-'));
    directories.push(cwd);
    const store = new MemoryGraphStore(cwd);

    let graph = createEmptyMemoryGraph();
    graph = upsertMemoryFact(graph, {
      confidence: 0.95,
      metadata: {files: ['src/agent/Agent.ts']},
      name: 'Agent memory retrieval',
      observation: 'Agent.ts should call loadRelevantMemory() instead of dumping the full memory graph.',
      source: 'user',
      type: 'decision',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.9,
      name: 'Relevant memory formatter',
      observation: 'Relevant memory context should stay concise.',
      source: 'user',
      type: 'convention',
    });
    graph = {
      ...graph,
      edges: [{
        confidence: 0.8,
        createdAt: new Date().toISOString(),
        from: graph.entities[0]?.id ?? 'missing',
        id: 'edge-agent-format',
        source: 'user',
        to: graph.entities[1]?.id ?? 'missing',
        type: 'decision_affects_module',
        updatedAt: new Date().toISOString(),
      }],
    };

    await store.save(graph);
    const results = await store.searchWithScores('update src/agent/Agent.ts relevant memory formatter', {topK: 2});

    expect(results[0]?.entity.name).toBe('Agent memory retrieval');
    expect(results[0]?.score.components.fileRelevance).toBeGreaterThan(0);
    expect(results[0]?.score.components.graphNeighborhood).toBeGreaterThan(0);
    expect(results[0]?.score.reasons).toEqual(expect.arrayContaining([
      'mentions the target file',
      'connected to related memory',
    ]));
  });
});
