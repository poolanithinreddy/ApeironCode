import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  canResume,
  clearRuntimeSnapshot,
  formatResumeSummary,
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  serializeRuntimeSnapshot,
} from '../../src/agent/runtimeResume.js';
import {createRuntimeState, snapshotRuntimeState, transitionRuntimeState} from '../../src/agent/runtimeState.js';

describe('runtimeResume', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, {force: true, recursive: true})));
  });

  it('serializes, saves, loads, and clears redacted snapshots', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-resume-'));
    dirs.push(cwd);
    const state = snapshotRuntimeState(transitionRuntimeState(createRuntimeState(), {message: 'interrupted', to: 'cancelled'}));
    const snapshot = serializeRuntimeSnapshot({
      changedFiles: ['src/a.ts'],
      createdAt: new Date().toISOString(),
      lastToolResultSummary: 'token=secret',
      prompt: 'fix bug with sk-secret123',
      sessionId: 's1',
      state,
    });

    await saveRuntimeSnapshot(cwd, snapshot);
    const loaded = await loadRuntimeSnapshot(cwd, 's1');

    expect(loaded?.prompt).not.toContain('sk-secret123');
    expect(loaded && canResume(loaded)).toBe(true);
    expect(formatResumeSummary(loaded!)).toContain('src/a.ts');
    await clearRuntimeSnapshot(cwd, loaded!);
    expect(await loadRuntimeSnapshot(cwd, 's1')).toBeNull();
  });
});
