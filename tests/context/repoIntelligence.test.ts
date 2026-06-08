import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  buildRepoIntelligenceReport,
  formatDetailedSymbolMatches,
  searchProjectSymbolsDetailed,
} from '../../src/context/repoIntelligence.js';
import {RepoMapManager} from '../../src/context/repoMap.js';
import {fixturePath} from '../support/fixturePath.js';

const fixtureRoot = fixturePath('node-basic');

const tempDirs: string[] = [];

describe('repoIntelligence', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, {force: true, recursive: true})));
  });

  it('builds a repo summary with important files and dependency hints', async () => {
    const report = await buildRepoIntelligenceReport({
      cwd: fixtureRoot,
      ignorePatterns: [],
    });

    expect(report.projectScan.projectName).toContain('node-basic');
    expect(report.importantFiles).toContain('package.json');
  });

  it('finds symbol matches with line context', async () => {
    const matches = await searchProjectSymbolsDetailed({
      cwd: fixtureRoot,
      ignorePatterns: [],
      query: 'value',
    });

    expect(matches[0]?.path).toBe('src/example.ts');
    expect(formatDetailedSymbolMatches(matches, 'value')).toContain('L1');
  });

  it('keeps repo maps out of node_modules by default', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-repo-map-'));
    tempDirs.push(tempDir);

    await fs.mkdir(path.join(tempDir, 'src'), {recursive: true});
    await fs.mkdir(path.join(tempDir, 'node_modules', 'left-pad'), {recursive: true});
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({name: 'repo-map-test'}, null, 2));
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n', 'utf8');

    const manager = new RepoMapManager(tempDir);
    const map = await manager.generateMap(tempDir);

    expect(map.entries.some((entry) => entry.path.startsWith('node_modules/'))).toBe(false);
    expect(map.entries.some((entry) => entry.path === 'src/index.ts')).toBe(true);
  });
});
