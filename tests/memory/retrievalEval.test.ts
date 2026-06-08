import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {MemoryManager} from '../../src/agent/memoryManager.js';
import {upsertMemoryFact} from '../../src/memory/graph.js';
import {createEmptyMemoryGraph, MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('memory retrieval evals', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, {force: true, recursive: true})));
  });

  it('selects relevant architecture memory, excludes irrelevant and redacts secrets', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-eval-project-'));
    const globalMemoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-eval-global-'));
    directories.push(projectDir, globalMemoryDir);

    const manager = new MemoryManager(projectDir, globalMemoryDir);
    await manager.saveProjectMemory({
      architecture: 'Agent prompt memory must use loadRelevantMemory() instead of dumping the full graph.',
      conventions: ['Keep memory prompt context concise.'],
      importantFiles: ['src/agent/Agent.ts'],
      testCommand: 'npm test',
    });
    await manager.saveGlobalMemory({
      customRules: ['Keep memory prompt context concise.'],
    });

    let graph = createEmptyMemoryGraph();
    graph = upsertMemoryFact(graph, {
      confidence: 0.93,
      metadata: {files: ['src/agent/Agent.ts']},
      name: 'Agent memory architecture',
      observation: 'src/agent/Agent.ts should call loadRelevantMemory() for concise relevant memory.',
      source: 'user',
      type: 'decision',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.9,
      name: 'Old model preference',
      observation: 'Use provider.chat() for all calls.',
      source: 'user',
      type: 'provider',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.8,
      name: 'Sandbox backend',
      observation: 'Docker backend handles command isolation.',
      source: 'user',
      type: 'module',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.7,
      name: 'OPENAI_API_KEY=sk-test-key-12345',
      observation: 'secret',
      source: 'user',
      type: 'task',
    });

    await new MemoryGraphStore(projectDir).save(graph);

    const relevant = await manager.explainRelevantMemory('update src/agent/Agent.ts memory prompt retrieval', 6);

    expect(relevant.content).toContain('Agent memory architecture');
    expect(relevant.content).toContain('mentions the target file');
    expect(relevant.content).toContain('[project+global] convention: Keep memory prompt context concise');
    expect(relevant.content).not.toContain('Sandbox backend');
    expect(relevant.content).not.toContain('sk-test-key-12345');
    expect(relevant.entries.length).toBeLessThanOrEqual(6);
    expect(relevant.totalTokens).toBeLessThan(2000);
  });

  it('handles empty memory cleanly and deterministically', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-eval-empty-'));
    directories.push(projectDir);

    const manager = new MemoryManager(projectDir);
    const first = await manager.loadRelevantMemory('anything here', 4);
    const second = await manager.loadRelevantMemory('anything here', 4);

    expect(first.content).toBe('No relevant memory matched the current prompt.');
    expect(first).toEqual(second);
  });
});
