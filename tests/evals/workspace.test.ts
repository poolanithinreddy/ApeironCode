import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {assertSafeCleanupPath, createEvalWorkspace} from '../../src/evals/workspace.js';

describe('eval workspace', () => {
  it('creates fixtures and supports read, write, exists, and commands inside cwd', async () => {
    const workspace = await createEvalWorkspace({
      fixtures: {'src/index.ts': 'export const value = 1;\n'},
    });
    try {
      expect(await workspace.exists('src/index.ts')).toBe(true);
      expect(await workspace.readFile('src/index.ts')).toContain('value');
      await workspace.writeFile('README.md', '# Demo\n');
      expect(await workspace.exists('README.md')).toBe(true);
      const result = await workspace.run(process.execPath, ['-e', 'console.log(process.cwd())']);
      expect(result.exitCode).toBe(0);
      expect(await fs.realpath(result.stdout)).toBe(await fs.realpath(workspace.cwd));
    } finally {
      await workspace.cleanup();
    }
  });

  it('initializes git when requested', async () => {
    const workspace = await createEvalWorkspace({git: true});
    try {
      expect(await workspace.exists('.git')).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });

  it('guards cleanup paths outside eval temp workspaces', async () => {
    expect(() => assertSafeCleanupPath('/')).toThrow(/Refusing/u);
    const unsafe = await fs.mkdtemp(path.join(os.tmpdir(), 'not-an-eval-'));
    expect(() => assertSafeCleanupPath(unsafe)).toThrow(/Refusing/u);
    await fs.rm(unsafe, {force: true, recursive: true});
  });
});
