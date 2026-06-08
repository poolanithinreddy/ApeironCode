import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {MemorySuggestionStore} from '../../src/memory/suggestions.js';
import {MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('memory suggestions', () => {
  it('redacts, approves, applies, and rejects suggestions', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-suggestions-'));
    const store = new MemorySuggestionStore(cwd);
    const suggestion = await store.append({
      proposedFacts: [{
        name: 'API_KEY=super-secret',
        observation: 'User prefers API_KEY=super-secret',
        type: 'user_preference',
      }],
      source: 'agent-run',
      summary: 'Remember API_KEY=super-secret preference',
    });

    expect(suggestion.redactionApplied).toBe(true);
    expect(suggestion.summary).toContain('[REDACTED_SECRET]');

    await store.apply(suggestion.id);
    const graph = await new MemoryGraphStore(cwd).load();
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0]?.name).toContain('[REDACTED_SECRET]');

    const rejected = await store.append({
      proposedFacts: [{name: 'docs', observation: 'Docs updated', type: 'task'}],
      source: 'manual',
      summary: 'Docs updated',
    });
    await store.reject(rejected.id);
    const suggestions = await store.list();
    expect(suggestions.find((entry) => entry.id === rejected.id)?.status).toBe('rejected');
  });

  it('approves all pending suggestions', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-approve-all-'));
    const store = new MemorySuggestionStore(cwd);
    await store.append({proposedFacts: [{name: 'one', observation: 'first', type: 'task'}], source: 'manual', summary: 'one'});
    await store.append({proposedFacts: [{name: 'two', observation: 'second', type: 'task'}], source: 'manual', summary: 'two'});

    expect(await store.applyAll()).toBe(2);
    const graph = await new MemoryGraphStore(cwd).load();
    expect(graph.entities.map((entry) => entry.name).sort()).toEqual(['one', 'two']);
  });
});
