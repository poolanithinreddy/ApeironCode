import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {buildContextViewReport, formatContextViewReport} from '../../src/context/contextViewer.js';
import {buildProjectBrainSummary} from '../../src/projectBrain/reader.js';
import {buildContinuationPromptFromBrain} from '../../src/projectBrain/continuation.js';
import {createProjectBrainInitPlan, formatProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {loadAgentDefinitions} from '../../src/workflows/agents/loader.js';
import {loadCommandDefinitions} from '../../src/workflows/commands/loader.js';

describe('Project Brain E2E', () => {
  it('plans, initializes with approval, validates workflows, reports context, and redacts summaries', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-e2e-'));
    const plan = await createProjectBrainInitPlan(cwd);
    expect(formatProjectBrainInitPlan(plan)).toContain('Requires approval: yes');
    await expect(fs.access(path.join(cwd, '.apeironcode'))).rejects.toThrow();
    expect((await applyProjectBrainInitPlan(plan, {approved: false})).ok).toBe(false);
    expect((await applyProjectBrainInitPlan(plan, {approved: true})).ok).toBe(true);
    const manifest = JSON.parse(await fs.readFile(path.join(cwd, '.apeironcode', 'manifest.json'), 'utf8')) as {version: number};
    expect(manifest.version).toBe(1);
    expect(loadAgentDefinitions(cwd, {skipTrustCheck: true}).some((result) => result.definition?.name === 'architect')).toBe(true);
    expect(loadCommandDefinitions(cwd, {skipTrustCheck: true}).some((result) => result.definition?.name === 'continue-plan')).toBe(true);
    await fs.appendFile(path.join(cwd, '.apeironcode', 'MEMORY.md'), '\napi_key=sk-secretsecretsecretsecret\n');
    const summary = await buildProjectBrainSummary(cwd);
    const view = formatContextViewReport(buildContextViewReport({
      contextMode: 'compressed',
      projectBrain: {present: true, safeLoadStatus: summary.safeLoadStatus, status: summary.status},
    }));
    expect(view).toContain('Project Brain');
    expect(await buildContinuationPromptFromBrain(cwd, 'continue')).toContain('PLAN.md');
    expect(await fs.readFile(path.join(cwd, '.apeironcode', 'MEMORY.md'), 'utf8')).toContain('sk-secret');
    expect(view).not.toContain('sk-secret');
  });
});
