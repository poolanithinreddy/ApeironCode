import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {findMatchingSkills} from '../../src/skills/loader.js';
import {createSkillFromDescription, createStarterSkill} from '../../src/skills/generator.js';
import {formatSkillBrowser, formatSkillRunPlan, formatSkillTemplates} from '../../src/skills/format.js';
import {buildSkillRunPlan} from '../../src/skills/runner.js';
import {SkillStore} from '../../src/skills/store.js';
import {validateSkillMetadata} from '../../src/skills/validator.js';

describe('skills', () => {
  it('creates, loads, matches, and builds a scoped run plan', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-skills-'));
    const store = new SkillStore(cwd);
    const starter = createStarterSkill('fix-tests');
    await store.save(starter.metadata, starter.markdown);

    const skills = await store.list();
    expect(skills).toHaveLength(1);
    expect(findMatchingSkills(skills, 'please fix-tests for math')).toHaveLength(1);

    const plan = buildSkillRunPlan(skills[0]!, 'failing unit test');
    expect(plan.allowedTools).toContain('read_file');
    expect(formatSkillRunPlan(plan)).toContain('failing unit test');
    expect(formatSkillBrowser(skills)).toContain('Skill Browser');
    expect(formatSkillBrowser(skills)).toContain('Allowed tools');
    expect(formatSkillTemplates()).toContain('Skill Templates');

    await store.updateTags('fix-tests', (tags) => [...tags, 'trusted']);
    expect(formatSkillBrowser(await store.list(), {filter: 'trusted'})).toContain('Trust: trusted');
    expect(formatSkillBrowser(await store.list(), {search: 'failing'})).toContain('fix-tests');
    await store.updateTags('fix-tests', (tags) => [...tags, 'disabled']);
    expect(formatSkillBrowser(await store.list(), {filter: 'disabled'})).toContain('Status: disabled');
  });

  it('rejects unsafe low-safety permissions', () => {
    const generated = createSkillFromDescription('write files from a prompt', 'write-files');
    expect(() => validateSkillMetadata({
      ...generated.metadata,
      requiredPermissions: ['FileWrite(src/**)'],
      safetyLevel: 'low',
    })).toThrow(/Low-safety/u);
  });
});
