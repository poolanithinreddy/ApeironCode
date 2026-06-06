import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {
  buildContinuationPromptFromBrain,
  detectContinuationIntent,
  shouldSuggestProjectBrain,
} from '../../src/projectBrain/continuation.js';

describe('Project Brain continuation', () => {
  it('detects continuation and large app-build prompts', () => {
    expect(detectContinuationIntent('continue')).toBe(true);
    expect(shouldSuggestProjectBrain(`build ${'a '.repeat(130)} app`)).toBe(true);
  });

  it('builds continuation prompt from PLAN and TASKS without forcing creation', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-cont-'));
    expect(await buildContinuationPromptFromBrain(cwd, 'continue')).toContain('Project Brain: missing');
    await applyProjectBrainInitPlan(await createProjectBrainInitPlan(cwd), {approved: true});
    await fs.appendFile(path.join(cwd, '.apeironcode', 'TASKS.md'), '\n- [ ] Ship CLI command\n');
    const prompt = await buildContinuationPromptFromBrain(cwd, 'next');
    expect(prompt).toContain('TASKS.md');
    expect(prompt).toContain('Ship CLI command');
  });
});
