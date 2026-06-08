import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {formatProjectBrainSummary, readProjectBrain} from '../../src/projectBrain/reader.js';

const temp = async (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-read-'));

describe('Project Brain reader', () => {
  it('handles missing brain gracefully', async () => {
    const brain = await readProjectBrain(await temp());
    expect(brain.exists).toBe(false);
    expect(brain.summary.status).toBe('missing');
  });

  it('reads summaries and redacts secrets', async () => {
    const cwd = await temp();
    await applyProjectBrainInitPlan(await createProjectBrainInitPlan(cwd), {approved: true});
    await fs.appendFile(path.join(cwd, '.apeironcode', 'MEMORY.md'), '\napi_key=sk-secretsecretsecretsecret\n');
    const brain = await readProjectBrain(cwd);
    expect(brain.exists).toBe(true);
    expect(formatProjectBrainSummary(brain.summary)).toContain('Project Brain');
    expect(brain.files.map((file) => file.content).join('\n')).not.toContain('sk-secret');
    expect(brain.summary.safeLoadStatus).toBe('blocked-untrusted');
  });
});
