import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  createCheckpoint,
  formatCheckpointSummary,
  getChangedFilesSinceCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from '../../src/agent/checkpoints.js';

describe('checkpoints', () => {
  const dirs: string[] = [];
  const makeDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-checkpoint-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, {force: true, recursive: true})));
  });

  it('creates, lists, summarizes, and detects changed files', async () => {
    const cwd = await makeDir();
    await fs.writeFile(path.join(cwd, 'a.txt'), 'one\n');
    const checkpoint = await createCheckpoint(cwd, {reason: 'before edit token=secret'});

    await fs.writeFile(path.join(cwd, 'a.txt'), 'two\n');

    expect(await listCheckpoints(cwd)).toHaveLength(1);
    expect(await getChangedFilesSinceCheckpoint(checkpoint)).toEqual(['a.txt']);
    expect(formatCheckpointSummary(checkpoint)).not.toContain('secret');
  });

  it('restores modified and deleted files and removes new files', async () => {
    const cwd = await makeDir();
    await fs.mkdir(path.join(cwd, 'src'));
    await fs.writeFile(path.join(cwd, 'src/a.ts'), 'export const a = 1;\n');
    await fs.writeFile(path.join(cwd, 'src/b.ts'), 'export const b = 1;\n');
    const checkpoint = await createCheckpoint(cwd);

    await fs.writeFile(path.join(cwd, 'src/a.ts'), 'changed\n');
    await fs.rm(path.join(cwd, 'src/b.ts'));
    await fs.writeFile(path.join(cwd, 'src/new.ts'), 'new\n');
    const restored = await restoreCheckpoint(checkpoint);

    expect(await fs.readFile(path.join(cwd, 'src/a.ts'), 'utf8')).toContain('a = 1');
    expect(await fs.readFile(path.join(cwd, 'src/b.ts'), 'utf8')).toContain('b = 1');
    await expect(fs.access(path.join(cwd, 'src/new.ts'))).rejects.toThrow();
    expect(restored.restored).toEqual(expect.arrayContaining(['src/a.ts', 'src/b.ts']));
    expect(restored.removed).toContain('src/new.ts');
  });

  it('skips huge and binary files safely', async () => {
    const cwd = await makeDir();
    await fs.writeFile(path.join(cwd, 'huge.txt'), 'x'.repeat(1024));
    await fs.writeFile(path.join(cwd, 'bin.dat'), Buffer.from([0, 1, 2]));
    const checkpoint = await createCheckpoint(cwd, {maxFileBytes: 10});

    expect(checkpoint.files.find((file) => file.path === 'huge.txt')?.skipped).toBe('huge');
    expect(checkpoint.files.find((file) => file.path === 'bin.dat')?.skipped).toBe('binary');
  });
});
