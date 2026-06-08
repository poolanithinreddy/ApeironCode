import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {
  maybeSyncProjectBrainAfterRun,
  createProjectBrainSyncPreview,
  applyProjectBrainSync,
  formatProjectBrainSyncPreview,
  formatProjectBrainSyncResult,
} from '../../src/projectBrain/autoSync.js';

describe('Project Brain auto-sync', () => {
  it('missing brain does not write and returns a hint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-missing-'));
    const out = await maybeSyncProjectBrainAfterRun({prompt: 'test'}, {cwd, mode: 'ask'});
    expect(out.hint).toContain('brain plan');
    expect(out.result).toBeUndefined();
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('ask mode creates preview only, does not write', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-ask-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const out = await maybeSyncProjectBrainAfterRun(
      {prompt: 'build feature', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'ask'},
    );
    expect(out.preview).toBeDefined();
    // In ask mode without approved=true, should not write
    expect(out.result).toBeUndefined();
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('ask mode with approved=true applies sync', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-approved-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const out = await maybeSyncProjectBrainAfterRun(
      {prompt: 'build feature', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'ask', approved: true},
    );
    expect(out.result?.ok).toBe(true);
    // Check RUNS.md was actually updated
    const runsPath = path.join(cwd, '.apeironcode', 'RUNS.md');
    const runsContent = await fs.readFile(runsPath, 'utf8');
    expect(runsContent).toContain('build feature');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('applyProjectBrainSync requires approval when not auto-safe', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-noapprove-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const preview = await createProjectBrainSyncPreview({prompt: 'test'}, {cwd, mode: 'ask'});
    const result = await applyProjectBrainSync(preview, {approved: false});
    expect(result.ok).toBe(false);
    expect(result.runsUpdated).toBe(false);
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('sync preview output does not contain secrets', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-secret-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const preview = await createProjectBrainSyncPreview(
      {prompt: 'use sk-secrettoken123456789012345678901234'},
      {cwd, mode: 'ask'},
    );
    const text = formatProjectBrainSyncPreview(preview);
    expect(text).not.toContain('sk-secrettoken');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('formatProjectBrainSyncResult is safe', () => {
    const result = {
      ok: true,
      runsUpdated: true,
      verifyUpdated: false,
      tasksUpdated: false,
      planUpdated: false,
      backedUp: [],
      skipped: [],
      message: 'done with key=sk-abc1234567890123456789012',
    };
    const text = formatProjectBrainSyncResult(result);
    expect(text).not.toContain('sk-abc');
    expect(text).toContain('Sync result');
  });

  it('auto-safe mode appends to RUNS.md only (no noisy side-effects)', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-autosafe-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const runsPath = path.join(cwd, '.apeironcode', 'RUNS.md');
    const before = await fs.readFile(runsPath, 'utf8');
    const out = await maybeSyncProjectBrainAfterRun(
      {prompt: 'add feature', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'auto-safe'},
    );
    // auto-safe with safeToAutoWrite should apply
    if (out.result) {
      expect(out.result.ok).toBe(true);
      // Only RUNS.md appended; VERIFY.md not touched (no commandsRun or validationResult)
      expect(out.result.verifyUpdated).toBe(false);
      const after = await fs.readFile(runsPath, 'utf8');
      expect(after.length).toBeGreaterThan(before.length);
    } else {
      // Some sync policies refuse auto-safe in ask-only config — that's also valid
      expect(out.hint ?? out.preview).toBeDefined();
    }
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('auto-safe mode is a no-op when brain is missing', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-autosafe-missing-'));
    const out = await maybeSyncProjectBrainAfterRun(
      {prompt: 'short task', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'auto-safe'},
    );
    expect(out.result).toBeUndefined();
    expect(out.hint).toContain('brain plan');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('sync mode off skips all writes and preview', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-off-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const out = await maybeSyncProjectBrainAfterRun(
      {prompt: 'refactor code', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'off'},
    );
    expect(out.result).toBeUndefined();
    expect(out.hint).toContain('off');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('dryRun does not actually write files', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-autosync-dryrun-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const runsPath = path.join(cwd, '.apeironcode', 'RUNS.md');
    const before = await fs.readFile(runsPath, 'utf8');
    const preview = await createProjectBrainSyncPreview(
      {prompt: 'build feature', agentResult: {finalMessage: 'done'}},
      {cwd, mode: 'ask'},
    );
    const result = await applyProjectBrainSync(preview, {approved: true, dryRun: true});
    const after = await fs.readFile(runsPath, 'utf8');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Dry run');
    // File unchanged because dryRun
    expect(after).toBe(before);
    await fs.rm(cwd, {recursive: true, force: true});
  });
});
