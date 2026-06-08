import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  MemoryManager,
  containsSensitiveMemoryContent,
} from '../../src/agent/memoryManager.js';
import {upsertMemoryFact} from '../../src/memory/graph.js';
import {createEmptyMemoryGraph, MemoryGraphStore} from '../../src/memory/graphStore.js';

describe('MemoryManager', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, {force: true, recursive: true})));
  });

  it('detects sensitive memory content', () => {
    expect(containsSensitiveMemoryContent('OPENAI_API_KEY=sk-1234567890abcdef1234567890')).toBe(true);
    expect(containsSensitiveMemoryContent('Use npm test before editing')).toBe(false);
  });

  it('filters sensitive paths from extracted project memory', () => {
    const manager = new MemoryManager('/tmp/opencode-memory-test');

    const extracted = manager.extractProjectMemoryFromRun({
      goal: 'Fix the parser bug',
      mode: 'fix',
      relevantFiles: ['src/parser.ts', '.env'],
      taskState: {
        commandsRun: [],
        errors: [],
        filesChanged: ['src/parser.ts'],
        filesRead: ['.env', 'src/parser.ts'],
        goal: 'Fix the parser bug',
        mode: 'fix',
        plan: [],
        startedAt: new Date().toISOString(),
        summary: null,
        testsRun: [],
        todos: [],
        updatedAt: new Date().toISOString(),
      },
    });

    expect(extracted.importantFiles).toContain('src/parser.ts');
    expect(extracted.importantFiles).not.toContain('.env');
  });

  it('loads only relevant memory with source attribution and dedupes overlapping project/global facts', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-project-'));
    const globalMemoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-global-'));
    directories.push(projectDir, globalMemoryDir);

    const manager = new MemoryManager(projectDir, globalMemoryDir);
    await manager.saveProjectMemory({
      conventions: ['Use targeted tests first'],
      importantFiles: ['src/auth.ts'],
      pitfalls: ['Auth failures usually need targeted login regression tests.'],
      testCommand: 'npm test -- auth',
    });
    await manager.saveGlobalMemory({
      codingStyle: 'Keep summaries concise and evidence-based.',
      customRules: ['Use targeted tests first'],
    });

    const graphStore = new MemoryGraphStore(projectDir);
    const graph = upsertMemoryFact(createEmptyMemoryGraph(), {
      confidence: 0.9,
      name: 'Auth module',
      observation: 'Auth regressions usually break login tests before other paths.',
      source: 'user',
      type: 'module',
    });
    const unrelated = upsertMemoryFact(graph, {
      confidence: 0.8,
      name: 'Docker backend',
      observation: 'Used for sandbox container execution.',
      source: 'user',
      type: 'module',
    });
    await graphStore.save(unrelated);

    const relevant = await manager.loadRelevantMemory('fix auth login tests and keep the summary concise', 5);

    expect(relevant.entries.length).toBeGreaterThan(0);
    expect(relevant.totalTokens).toBeLessThan(2000);
    expect(relevant.content).toContain('[project] module: Auth module');
    expect(relevant.content).toContain('[project+global] convention: Use targeted tests first');
    expect(relevant.content).not.toContain('[global] user_preference: Coding style');
    expect(relevant.content).not.toContain('Docker backend');
    expect(relevant.content).not.toContain('schemaVersion');
    expect(relevant.content).not.toContain('updatedAt');
  });

  it('excludes superseded graph memories and secret-like content from relevant memory', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-project-'));
    const globalMemoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-memory-global-'));
    directories.push(projectDir, globalMemoryDir);

    const manager = new MemoryManager(projectDir, globalMemoryDir);
    const graphStore = new MemoryGraphStore(projectDir);
    let graph = upsertMemoryFact(createEmptyMemoryGraph(), {
      confidence: 0.95,
      metadata: {verified: true},
      name: 'MCP transport support current',
      observation: 'MCP supports stdio, HTTP, and SSE transports.',
      source: 'user',
      type: 'module',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.9,
      metadata: {deprecated: true, supersededBy: 'new'},
      name: 'MCP transport support old',
      observation: 'MCP is stdio-only.',
      source: 'user',
      type: 'module',
    });
    graph = upsertMemoryFact(graph, {
      confidence: 0.9,
      name: 'MCP secret',
      observation: 'Authorization Bearer abcdefghijklmnopqrstuvwxyz123456',
      source: 'user',
      type: 'module',
    });
    await graphStore.save(graph);

    const relevant = await manager.loadRelevantMemory('explain MCP transport support', 5);
    expect(relevant.content).toContain('stdio, HTTP, and SSE');
    expect(relevant.content).not.toContain('stdio-only');
    expect(relevant.content).not.toContain('Bearer');
  });
});
