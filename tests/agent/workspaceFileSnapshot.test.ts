import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  buildWorkspaceSnapshotForIntent,
  readWorkspaceFiles,
} from '../../src/agent/workspaceFileSnapshot.js';

describe('workspaceFileSnapshot', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'wfs-'));
    await fs.mkdir(path.join(cwd, 'calculator'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'calculator/index.html'), '<h1>calc</h1>');
    await fs.writeFile(path.join(cwd, 'calculator/styles.css'), 'body{}');
    await fs.writeFile(path.join(cwd, 'calculator/script.js'), 'const a=1;');
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  it('reads known files with valid paths', async () => {
    const entries = await readWorkspaceFiles(
      ['calculator/index.html', 'calculator/styles.css', 'calculator/script.js'],
      {cwd},
    );
    expect(entries.map((e) => e.exists)).toEqual([true, true, true]);
    expect(entries[0]?.content).toContain('calc');
    expect(entries[0]?.size).toBeGreaterThan(0);
  });

  it('captures a missing file safely', async () => {
    const [entry] = await readWorkspaceFiles(['calculator/missing.js'], {cwd});
    expect(entry?.exists).toBe(false);
    expect(entry?.error).toBe('not found');
  });

  it('blocks path traversal / absolute paths', async () => {
    const entries = await readWorkspaceFiles(['../../etc/passwd', '/etc/hosts'], {cwd});
    expect(entries.every((e) => !e.exists)).toBe(true);
    expect(entries.every((e) => (e.error ?? '').includes('outside') || e.error === 'not found')).toBe(true);
  });

  it('ignores empty/undefined paths (no undefined path reaches fs)', async () => {
    const entries = await readWorkspaceFiles(['', '   '], {cwd});
    expect(entries).toEqual([]);
  });

  it('builds a snapshot that includes nested app files', async () => {
    const {snapshot, inspected} = await buildWorkspaceSnapshotForIntent(
      {suggestedFiles: []},
      cwd,
    );
    expect(inspected).toEqual(
      expect.arrayContaining(['calculator/index.html', 'calculator/styles.css', 'calculator/script.js']),
    );
    expect(snapshot).toContain('--- calculator/index.html ---');
  });
});
