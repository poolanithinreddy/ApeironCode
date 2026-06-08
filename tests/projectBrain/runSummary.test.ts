import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {appendRunSummary, createRunSummaryFromAgentResult, formatRunSummary} from '../../src/projectBrain/runSummary.js';

describe('Project Brain run summaries', () => {
  it('creates, redacts, and appends summaries only when approved', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-runs-'));
    const summary = createRunSummaryFromAgentResult({
      filesChanged: ['src/app.ts'],
      finalMessage: 'done with api_key=sk-secretsecretsecretsecret',
      status: 'completed',
    }, {prompt: 'build'});
    expect(formatRunSummary(summary)).not.toContain('sk-secret');
    expect(await appendRunSummary(cwd, summary, {approved: true, enabled: true})).toBe(false);
    await applyProjectBrainInitPlan(await createProjectBrainInitPlan(cwd), {approved: true});
    expect(await appendRunSummary(cwd, summary, {approved: false, enabled: true})).toBe(false);
    expect(await appendRunSummary(cwd, summary, {approved: true, enabled: true})).toBe(true);
  });
});
