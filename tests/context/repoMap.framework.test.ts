import {describe, expect, it} from 'vitest';
import {detectFrameworkHints, detectPackageBoundaries, summarizeRepoMap} from '../../src/context/repoMap.js';
import type {RepoMap} from '../../src/context/repoMap.js';

describe('detectPackageBoundaries', () => {
  it('finds JS, Python, Go, and Java workspace manifests', () => {
    const boundaries = detectPackageBoundaries([
      'package.json',
      'packages/web/package.json',
      'pyproject.toml',
      'service/go.mod',
      'java/pom.xml',
      'src/index.ts',
    ]);
    expect(boundaries.map((b) => b.manifestPath).sort()).toEqual([
      'java/pom.xml',
      'package.json',
      'packages/web/package.json',
      'pyproject.toml',
      'service/go.mod',
    ]);
  });
});

describe('detectFrameworkHints', () => {
  it('flags Next.js when dependency present', () => {
    const hints = detectFrameworkHints(['src/page.tsx'], {dependencies: {next: '*', react: '*'}});
    expect(hints[0]?.framework).toBe('next');
  });
  it('flags React from .tsx files', () => {
    const hints = detectFrameworkHints(['src/App.tsx']);
    expect(hints.some((h) => h.framework === 'react')).toBe(true);
  });
  it('flags Python from pyproject.toml', () => {
    const hints = detectFrameworkHints(['pyproject.toml']);
    expect(hints.some((h) => h.framework === 'python')).toBe(true);
  });
  it('flags Go and Java', () => {
    expect(detectFrameworkHints(['go.mod']).some((h) => h.framework === 'go')).toBe(true);
    expect(detectFrameworkHints(['pom.xml']).some((h) => h.framework === 'java')).toBe(true);
  });
  it('falls back to unknown when nothing matches', () => {
    expect(detectFrameworkHints(['README.md'])[0]?.framework).toBe('unknown');
  });
});

describe('summarizeRepoMap', () => {
  it('renders compact summary', () => {
    const map: RepoMap = {
      configFiles: ['package.json'],
      configSignature: 'sig',
      entries: [],
      entryPoints: ['src/index.ts'],
      fileCount: 12,
      languages: {TypeScript: 7, JavaScript: 5},
      lastIndexed: new Date().toISOString(),
      projectScan: {
        frameworks: ['Vitest'],
        languages: ['TypeScript'],
        packageManager: 'npm',
        projectName: 'demo',
        projectSummary: 'demo',
        repoRoot: '.',
        sourceDirectories: ['src'],
        testCommand: 'npm test',
        lintCommand: 'npm run lint',
        buildCommand: 'npm run build',
      } as unknown as RepoMap['projectScan'],
      testFiles: ['x.test.ts'],
      version: '1.0',
    };
    const text = summarizeRepoMap(map);
    expect(text).toContain('12 files');
    expect(text).toContain('Languages:');
    expect(text).toContain('Vitest');
  });
});
