import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {loadSkillDefinition, loadSkillDefinitions} from '../../src/workflows/skills/loader.js';

vi.mock('../../src/safety/projectTrust.js', () => ({
  getProjectTrustStatus: vi.fn().mockReturnValue({trust: 'untrusted', warnings: []}),
  markProjectTrusted: vi.fn(),
  markProjectUntrusted: vi.fn(),
  requiresTrustForAction: vi.fn().mockReturnValue({requiresTrust: false, action: '', reason: ''}),
  formatProjectTrustWarning: vi.fn().mockReturnValue(''),
}));

import {getProjectTrustStatus} from '../../src/safety/projectTrust.js';

const mkdtemp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-skill-test-'));

const writeSkill = (dir: string, skillName: string, content: string): string => {
  const skillDir = path.join(dir, '.apeironcode', 'skills', skillName);
  fs.mkdirSync(skillDir, {recursive: true});
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return skillDir;
};

describe('loadSkillDefinition', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('loads skill metadata without body (progressive disclosure default)', () => {
    const skillDir = writeSkill(tmpDir, 'react-perf', `---
name: react-performance
description: Helps optimize React rendering.
whenToUse: React performance, slow components, memoization
allowedTools: [read_file, grep_search]
tokenBudget: 1200
progressiveDisclosure: true
---

Use this skill when dealing with React performance issues.
Check for unnecessary re-renders first.`);

    const result = loadSkillDefinition(skillDir, 'project');
    expect(result.definition).not.toBeNull();
    expect(result.definition?.name).toBe('react-performance');
    expect(result.definition?.description).toBe('Helps optimize React rendering.');
    expect(result.definition?.whenToUse).toBe('React performance, slow components, memoization');
    expect(result.definition?.tokenBudget).toBe(1200);
    expect(result.definition?.progressiveDisclosure).toBe(true);
    // Body should be empty by default (progressive disclosure)
    expect(result.definition?.body).toBe('');
  });

  it('includes body when includeBody is true', () => {
    const skillDir = writeSkill(tmpDir, 'full-skill', `---
name: full-skill
description: Full skill.
---

Full skill body content.`);

    const result = loadSkillDefinition(skillDir, 'project', {includeBody: true});
    expect(result.definition?.body).toContain('Full skill body content.');
  });

  it('rejects missing name', () => {
    const skillDir = writeSkill(tmpDir, 'noname', `---
description: No name.
---
Body.`);
    const result = loadSkillDefinition(skillDir, 'project');
    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('rejects missing description', () => {
    const skillDir = writeSkill(tmpDir, 'nodesc', `---
name: nodesc
---
Body.`);
    const result = loadSkillDefinition(skillDir, 'project');
    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'description')).toBe(true);
  });
});

describe('loadSkillDefinitions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    vi.resetAllMocks();
  });

  it('returns empty array when no skills dir', () => {
    const results = loadSkillDefinitions(tmpDir);
    expect(results).toHaveLength(0);
  });

  it('blocks skills for untrusted project', () => {
    writeSkill(tmpDir, 'blocked-skill', `---\nname: blocked\ndescription: test\n---\nBody.`);
    const results = loadSkillDefinitions(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]?.trustStatus).toBe('blocked');
    expect(results[0]?.definition).toBeNull();
    expect(results[0]?.issues[0]?.message).toContain('not trusted');
  });

  it('loads skills for trusted project (metadata only by default)', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
    writeSkill(tmpDir, 'trusted-skill', `---
name: trusted-skill
description: Trusted skill description.
whenToUse: Testing skill loading
---
Full skill body.`);

    const results = loadSkillDefinitions(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]?.definition?.name).toBe('trusted-skill');
    // Body excluded by default (progressive disclosure)
    expect(results[0]?.definition?.body).toBe('');
  });

  it('loads skills with body when includeBody is true', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
    writeSkill(tmpDir, 'body-skill', `---
name: body-skill
description: Skill with body.
---
Skill body text.`);

    const results = loadSkillDefinitions(tmpDir, {includeBody: true});
    expect(results[0]?.definition?.body).toContain('Skill body text.');
  });

  it('allows load when skipTrustCheck is true', () => {
    writeSkill(tmpDir, 'skip-skill', `---
name: skip-skill
description: Skip trust check.
---
Body.`);
    const results = loadSkillDefinitions(tmpDir, {skipTrustCheck: true});
    expect(results[0]?.definition?.name).toBe('skip-skill');
    expect(results[0]?.trustStatus).toBe('allowed');
  });
});
