import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {getProjectBrainSyncDecision, formatProjectBrainSyncDecision} from '../../src/projectBrain/syncPolicy.js';
import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';

describe('Project Brain sync policy', () => {
  it('off mode always refuses', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-'));
    const decision = await getProjectBrainSyncDecision({kind: 'run-completed', cwd}, {mode: 'off'});
    expect(decision.action).toBe('refuse');
    expect(decision.safeToAutoWrite).toBe(false);
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('ask mode shows preview', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-ask-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const decision = await getProjectBrainSyncDecision({kind: 'run-completed', cwd}, {mode: 'ask'});
    expect(decision.action).toBe('show-preview');
    expect(decision.safeToAutoWrite).toBe(false);
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('refuses when brain is missing', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-missing-'));
    const decision = await getProjectBrainSyncDecision({kind: 'run-completed', cwd}, {mode: 'auto-safe'});
    expect(decision.action).toBe('refuse');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('refuses when secrets detected', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-secret-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const decision = await getProjectBrainSyncDecision(
      {kind: 'run-completed', cwd, hasSecrets: true},
      {mode: 'auto-safe'},
    );
    expect(decision.action).toBe('refuse');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('requires approval for large updates', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-large-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const decision = await getProjectBrainSyncDecision(
      {kind: 'run-completed', cwd, isLargeUpdate: true},
      {mode: 'auto-safe'},
    );
    expect(decision.action).toBe('require-approval');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('formatProjectBrainSyncDecision output is safe', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-sync-fmt-'));
    const decision = await getProjectBrainSyncDecision({kind: 'run-completed', cwd}, {mode: 'off'});
    const text = formatProjectBrainSyncDecision(decision);
    expect(text).toContain('Sync action:');
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{20,}/u);
    await fs.rm(cwd, {recursive: true, force: true});
  });
});
