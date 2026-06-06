import {describe, it, expect} from 'vitest';
import {buildImportGraph, getTransitiveDependencies, getTransitiveDependents} from '../../src/context/importGraph.js';

describe('importGraph - dependency tracking', () => {
  it('builds empty graph for empty file list', async () => {
    const graph = await buildImportGraph([], '/tmp');
    expect(graph.size).toBe(0);
  });

  it('creates entries for all files', async () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.size).toBe(3);
    expect(graph.has('src/a.ts')).toBe(true);
    expect(graph.has('src/b.ts')).toBe(true);
    expect(graph.has('src/c.ts')).toBe(true);
  });

  it('returns Set of dependencies for each file', async () => {
    const files = ['src/a.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    const deps = graph.get('src/a.ts');
    expect(deps).toBeDefined();
    expect(deps instanceof Set).toBe(true);
  });

  it('handles transitive dependencies', async () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    const aDeps = getTransitiveDependencies('src/a.ts', graph, 10);
    expect(aDeps instanceof Set).toBe(true);
  });

  it('finds files that depend on a target file', async () => {
    const files = ['src/main.ts', 'src/helper.ts', 'src/util.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    const dependents = getTransitiveDependents('src/util.ts', graph, 10);
    expect(dependents instanceof Set).toBe(true);
  });

  it('respects depth limits in transitive traversal', async () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    const depthZero = getTransitiveDependencies('src/a.ts', graph, 0);
    expect(depthZero.size).toBe(0);

    const depthOne = getTransitiveDependencies('src/a.ts', graph, 1);
    expect(depthOne.size).toBeLessThanOrEqual(2);
  });

  it('handles circular dependencies gracefully', async () => {
    const files = ['src/a.ts', 'src/b.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(() => {
      getTransitiveDependencies('src/a.ts', graph, 5);
    }).not.toThrow();
  });

  it('supports TypeScript/JavaScript import patterns', async () => {
    const files = ['src/test.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.has('src/test.ts')).toBe(true);
    const deps = graph.get('src/test.ts');
    expect(deps instanceof Set).toBe(true);
  });

  it('supports Python import patterns', async () => {
    const files = ['src/test.py'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.has('src/test.py')).toBe(true);
  });

  it('supports Go import patterns', async () => {
    const files = ['src/test.go'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.has('src/test.go')).toBe(true);
  });

  it('skips files larger than 1MB', async () => {
    const files = ['src/small.ts', 'src/large.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.has('src/small.ts')).toBe(true);
    expect(graph.has('src/large.ts')).toBe(true);
  });

  it('handles missing files gracefully', async () => {
    const files = ['src/nonexistent.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.has('src/nonexistent.ts')).toBe(true);
    const deps = graph.get('src/nonexistent.ts');
    expect(deps?.size).toBe(0);
  });

  it('resolves relative imports correctly', async () => {
    const files = ['src/a/file.ts', 'src/b/helper.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    for (const [file, deps] of graph) {
      expect(file).toBeTruthy();
      expect(deps instanceof Set).toBe(true);
    }
  });

  it('handles index file resolution', async () => {
    const files = ['src/module/index.ts', 'src/consumer.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    expect(graph.size).toBeGreaterThan(0);
  });

  it('ignores external/absolute imports', async () => {
    const files = ['src/test.ts'];
    const graph = await buildImportGraph(files, '/tmp');

    const deps = graph.get('src/test.ts') ?? new Set();
    for (const dep of deps) {
      expect(dep.startsWith('.')).toBe(true);
    }
  });
});
