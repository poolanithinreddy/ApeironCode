import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {scanProject} from '../../src/agent/projectScanner.js';
import {fileExists} from '../../src/utils/fs.js';

describe('Workflow Fixtures', () => {
  describe('Node fixture: failing test', () => {
    const fixturePath = path.join(process.cwd(), 'tests/fixtures/node-failing-test');

    it('should detect the node project structure', async () => {
      expect(await fileExists(path.join(fixturePath, 'package.json'))).toBe(true);
      expect(await fileExists(path.join(fixturePath, 'src/math.ts'))).toBe(true);
      expect(await fileExists(path.join(fixturePath, 'tests/math.test.ts'))).toBe(true);
    });

    it('should identify test failures through project scanner', async () => {
      const scan = await scanProject(fixturePath);
      expect(scan.projectSummary).toBeDefined();
      expect(scan.projectSummary).toContain('math-bug-demo');
      expect(scan.projectSummary).toContain('TypeScript');
    });
  });

  describe('Git fixture: sample repo', () => {
    const fixturePath = path.join(process.cwd(), 'tests/fixtures/git-sample');

    it('should have git initialized', async () => {
      expect(await fileExists(path.join(fixturePath, '.git'))).toBe(true);
    });

    it('should have initial commit', async () => {
      expect(await fileExists(path.join(fixturePath, 'README.md'))).toBe(true);
    });
  });

  describe('Plugin fixture: echo plugin', () => {
    const fixturePath = path.join(process.cwd(), 'tests/fixtures/plugin-workspace');

    it('should have plugin manifest', async () => {
      expect(await fileExists(path.join(fixturePath, '.apeironcode-agent/plugins/echo-plugin/plugin.manifest.json'))).toBe(true);
    });

    it('should have plugin implementation', async () => {
      expect(await fileExists(path.join(fixturePath, '.apeironcode-agent/plugins/echo-plugin/plugin.js'))).toBe(true);
    });
  });

  describe('Fixture discovery', () => {
    it('should find all fixtures', async () => {
      const baseFixturesPath = path.join(process.cwd(), 'tests/fixtures');

      expect(await fileExists(path.join(baseFixturesPath, 'node-basic'))).toBe(true);
      expect(await fileExists(path.join(baseFixturesPath, 'node-failing-test'))).toBe(true);
      expect(await fileExists(path.join(baseFixturesPath, 'git-sample'))).toBe(true);
      expect(await fileExists(path.join(baseFixturesPath, 'plugin-workspace'))).toBe(true);
    });
  });
});
