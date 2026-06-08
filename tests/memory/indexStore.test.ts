import fs from 'node:fs/promises';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {upsertMemoryFact} from '../../src/memory/graph.js';
import {createEmptyMemoryGraph} from '../../src/memory/graphStore.js';
import {getMemoryIndexPath, MemoryIndexStore} from '../../src/memory/indexStore.js';
import {TextIndex} from '../../src/memory/embeddings.js';

describe('MemoryIndexStore', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
  });

  it('saves and loads an index', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-index-'));
    directories.push(cwd);
    const store = new MemoryIndexStore(cwd);
    const index = new TextIndex();
    index.add('auth', 'Auth regression tests');

    await store.save(index);
    const loaded = await store.load();

    expect(loaded.query('regression auth', 1)[0]?.id).toBe('auth');
  });

  it('rebuilds from a graph and creates a queryable index file', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-index-'));
    directories.push(cwd);
    const store = new MemoryIndexStore(cwd);
    const graph = upsertMemoryFact(createEmptyMemoryGraph(), {
      name: 'Auth module',
      observation: 'Auth regressions need targeted session tests.',
      source: 'user',
      type: 'module',
    });

    const rebuilt = await store.rebuild(graph);

    expect(rebuilt.query('session auth tests', 1)[0]?.id).toBe(graph.entities[0]?.id);
    expect(await fs.readFile(getMemoryIndexPath(cwd), 'utf8')).toContain(graph.entities[0]?.id ?? '');
  });

  it('recovers from a corrupted index by rebuilding on ensureCurrent', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-index-'));
    directories.push(cwd);
    const store = new MemoryIndexStore(cwd);
    const graph = upsertMemoryFact(createEmptyMemoryGraph(), {
      name: 'Parser loop',
      observation: 'Malformed tool JSON should trigger a retry.',
      source: 'user',
      type: 'module',
    });

    await fs.mkdir(path.dirname(getMemoryIndexPath(cwd)), {recursive: true});
    await fs.writeFile(getMemoryIndexPath(cwd), '{not-valid-json', 'utf8');

    const recovered = await store.ensureCurrent(graph);

    expect(recovered.query('retry malformed json', 1)[0]?.id).toBe(graph.entities[0]?.id);
  });

  it('handles a missing index by rebuilding it', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-memory-index-'));
    directories.push(cwd);
    const store = new MemoryIndexStore(cwd);
    const graph = upsertMemoryFact(createEmptyMemoryGraph(), {
      name: 'Sandbox manager',
      observation: 'Prefers docker, then podman, then firejail.',
      source: 'user',
      type: 'module',
    });

    const index = await store.ensureCurrent(graph);

    expect(index.query('docker firejail', 1)[0]?.id).toBe(graph.entities[0]?.id);
    await expect(fs.access(getMemoryIndexPath(cwd))).resolves.toBeUndefined();
  });
});