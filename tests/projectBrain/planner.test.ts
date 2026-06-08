import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {
  classifyProjectBrainFileStatus,
  createProjectBrainInitPlan,
  detectExistingProjectBrain,
  formatProjectBrainInitPlan,
} from '../../src/projectBrain/planner.js';

const temp = async (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-plan-'));

describe('Project Brain planner', () => {
  it('creates a no-write plan for fresh workspaces', async () => {
    const cwd = await temp();
    const plan = await createProjectBrainInitPlan(cwd, {now: '2026-01-01T00:00:00.000Z'});
    expect(plan.requiresApproval).toBe(true);
    expect(plan.mode).toBe('create');
    expect(await fs.readdir(cwd)).toEqual([]);
    expect(plan.files.some((file) => file.relativePath === '.apeironcode/PROJECT.md')).toBe(true);
  });

  it('detects existing Project Brain files as merge/preserve', async () => {
    const cwd = await temp();
    await fs.mkdir(path.join(cwd, '.apeironcode'), {recursive: true});
    await fs.writeFile(path.join(cwd, '.apeironcode', 'PROJECT.md'), '# Existing\n');
    expect(await detectExistingProjectBrain(cwd)).toBe('partial');
    const statuses = await classifyProjectBrainFileStatus(cwd);
    expect(statuses['.apeironcode/PROJECT.md']).toBe('will-preserve');
  });

  it('detects conflicting paths and redacts formatted output', async () => {
    const cwd = await temp();
    await fs.writeFile(path.join(cwd, '.apeironcode'), 'api_key=sk-secretsecretsecretsecret\n');
    const plan = await createProjectBrainInitPlan(cwd);
    expect(plan.status).toBe('conflict');
    const formatted = formatProjectBrainInitPlan(plan);
    expect(formatted).toContain('Requires approval: yes');
    expect(formatted).not.toContain('sk-secret');
  });
});
