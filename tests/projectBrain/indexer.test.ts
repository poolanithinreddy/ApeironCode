import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {indexProjectBrainForContext} from '../../src/projectBrain/indexer.js';

describe('Project Brain indexer', () => {
  it('indexes memory and plan into budgeted safe chunks', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-index-'));
    await applyProjectBrainInitPlan(await createProjectBrainInitPlan(cwd), {approved: true});
    await fs.appendFile(path.join(cwd, '.apeironcode', 'PLAN.md'), '\nNext action: wire CLI.\n');
    await fs.appendFile(path.join(cwd, '.apeironcode', 'MEMORY.md'), '\ntoken=abc123abc123abc123abc123abc123\n');
    const chunks = await indexProjectBrainForContext(cwd, {maxTokens: 500});
    expect(chunks.some((chunk) => chunk.path.endsWith('MEMORY.md'))).toBe(true);
    expect(chunks.map((chunk) => chunk.content).join('\n')).not.toContain('abc123abc');
  });
});
