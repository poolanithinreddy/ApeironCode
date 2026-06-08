import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan, formatProjectBrainInitResult} from '../../src/projectBrain/writer.js';

const temp = async (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-write-'));

describe('Project Brain writer', () => {
  it('refuses unapproved writes', async () => {
    const cwd = await temp();
    const plan = await createProjectBrainInitPlan(cwd);
    const result = await applyProjectBrainInitPlan(plan, {approved: false});
    expect(result.ok).toBe(false);
    await expect(fs.access(path.join(cwd, '.apeironcode'))).rejects.toThrow();
  });

  it('dry run writes nothing even when approved', async () => {
    const cwd = await temp();
    const plan = await createProjectBrainInitPlan(cwd);
    const result = await applyProjectBrainInitPlan(plan, {approved: true, dryRun: true});
    expect(result.dryRun).toBe(true);
    await expect(fs.access(path.join(cwd, '.apeironcode'))).rejects.toThrow();
  });

  it('approved init creates manifest and preserves existing files', async () => {
    const cwd = await temp();
    await fs.mkdir(path.join(cwd, '.apeironcode'), {recursive: true});
    await fs.writeFile(path.join(cwd, '.apeironcode', 'PROJECT.md'), '# Mine\npassword=secret\n');
    const plan = await createProjectBrainInitPlan(cwd);
    const result = await applyProjectBrainInitPlan(plan, {approved: true});
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(cwd, '.apeironcode', 'PROJECT.md'), 'utf8')).toContain('# Mine');
    const manifest = JSON.parse(await fs.readFile(path.join(cwd, '.apeironcode', 'manifest.json'), 'utf8')) as {version: number};
    expect(manifest.version).toBe(1);
    expect(formatProjectBrainInitResult(result)).not.toContain('password=secret');
  });
});
