/**
 * E2E: Workflow Extensibility
 * Tests project-level Markdown agent/skill/command loading,
 * progressive disclosure, trust gating, alias resolution, and skillify.
 * No real provider calls. No real network.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../src/safety/projectTrust.js', () => ({
  getProjectTrustStatus: vi.fn().mockReturnValue({trust: 'trusted', warnings: []}),
  markProjectTrusted: vi.fn(),
  markProjectUntrusted: vi.fn(),
  requiresTrustForAction: vi.fn().mockReturnValue({requiresTrust: false, action: '', reason: ''}),
  formatProjectTrustWarning: vi.fn().mockReturnValue(''),
}));

import {getProjectTrustStatus} from '../../src/safety/projectTrust.js';
import type {} from '../../src/workflows/agents/loader.js';
import {loadSkillDefinitions} from '../../src/workflows/skills/loader.js';
import {loadCommandDefinitions} from '../../src/workflows/commands/loader.js';
import {WorkflowRegistry} from '../../src/workflows/registry.js';
import {selectRelevantSkills} from '../../src/workflows/skills/selector.js';
import {formatSkillsForPrompt} from '../../src/workflows/skills/formatter.js';
import {createSkillDraftFromWorkflow} from '../../src/workflows/skillify.js';
import {parseMarkdownFrontmatter} from '../../src/workflows/markdown/frontmatter.js';

const mkdtemp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-e2e-wf-'));

const write = (dir: string, rel: string, content: string): void => {
  const fullPath = path.join(dir, rel);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, content, 'utf8');
};

describe('Workflow Extensibility E2E', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    vi.resetAllMocks();
  });

  it('discovers project command file', () => {
    write(tmpDir, '.apeironcode/commands/review-pr.md', `---
name: review-pr
description: Review PR.
aliases: [pr]
requiresTrust: false
---
Review {{args}}.`);

    const results = loadCommandDefinitions(tmpDir, {skipTrustCheck: true});
    expect(results).toHaveLength(1);
    expect(results[0]?.definition?.name).toBe('review-pr');
  });

  it('discovers project skill file but only metadata without body (progressive disclosure)', () => {
    write(tmpDir, '.apeironcode/skills/my-skill/SKILL.md', `---
name: my-skill
description: A skill.
whenToUse: keyword testing
---
Full skill body that should be hidden initially.`);

    const results = loadSkillDefinitions(tmpDir, {skipTrustCheck: true});
    expect(results).toHaveLength(1);
    expect(results[0]?.definition?.name).toBe('my-skill');
    // Body is empty by default (progressive disclosure)
    expect(results[0]?.definition?.body).toBe('');
    expect(results[0]?.definition?.description).toBe('A skill.');
  });

  it('selected skill includes body when loaded with includeBody', () => {
    write(tmpDir, '.apeironcode/skills/testing-skill/SKILL.md', `---
name: testing-skill
description: Improve test coverage and quality.
whenToUse: tests, coverage, unit tests
---
When testing, always write unit tests first.`);

    const withBody = loadSkillDefinitions(tmpDir, {skipTrustCheck: true, includeBody: true});
    expect(withBody[0]?.definition?.body).toContain('unit tests first');
  });

  it('selected skill is injected into prompt formatter utility', () => {
    write(tmpDir, '.apeironcode/skills/security-skill/SKILL.md', `---
name: security-skill
description: Security audit for code changes.
whenToUse: security, vulnerabilities, audit
---
Always check for SQL injection and XSS vulnerabilities.`);

    const results = loadSkillDefinitions(tmpDir, {skipTrustCheck: true, includeBody: true});
    const skills = results.map((r) => r.definition).filter(Boolean) as NonNullable<typeof results[0]['definition']>[];
    expect(skills).toHaveLength(1);

    const selected = selectRelevantSkills('security audit vulnerabilities', skills);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.name).toBe('security-skill');

    const formatted = formatSkillsForPrompt(selected, 'full');
    expect(formatted).toContain('security-skill');
    expect(formatted).toContain('SQL injection');
    expect(formatted).not.toContain('SECRET_KEY');
  });

  it('untrusted project command requiring trust is blocked', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});

    write(tmpDir, '.apeironcode/commands/guarded.md', `---
name: guarded-cmd
description: Protected command.
requiresTrust: true
---
Secret operation on {{args}}.`);

    const results = loadCommandDefinitions(tmpDir);
    expect(results[0]?.trustStatus).toBe('blocked');
    expect(results[0]?.definition).toBeNull();
    expect(results[0]?.issues[0]?.message).toContain('requires trust');
  });

  it('command alias resolves via registry', () => {
    write(tmpDir, '.apeironcode/commands/review.md', `---
name: review
description: Review code.
aliases: [rv, code-review]
requiresTrust: false
---
Review code in {{args}}.`);

    const registry = new WorkflowRegistry();
    registry.loadProjectWorkflows(tmpDir, {skipTrustCheck: true});

    expect(registry.findCommand('rv')?.name).toBe('review');
    expect(registry.findCommand('code-review')?.name).toBe('review');
    expect(registry.findCommand('review')?.name).toBe('review');
    expect(registry.findCommand('nonexistent')).toBeUndefined();
  });

  it('skillify creates a valid SKILL.md draft', () => {
    const draft = createSkillDraftFromWorkflow({
      name: 'pr-review-skill',
      description: 'Systematic PR review process.',
      whenToUse: 'PR review, code review, git diff',
      allowedTools: ['git_diff', 'read_file'],
      body: '1. Check diff for regressions.\n2. Verify tests added.\n3. Check security.',
    });

    expect(draft.name).toBe('pr-review-skill');
    expect(draft.markdown).toContain('---');
    expect(draft.markdown).toContain('pr-review-skill');

    const parsed = parseMarkdownFrontmatter(draft.markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data['name']).toBe('pr-review-skill');
    expect(parsed.data['progressiveDisclosure']).toBe(true);
    expect(parsed.body).toContain('Check diff for regressions');
  });

  it('workflow doctor checks include workflow registry status', async () => {
    write(tmpDir, '.apeironcode/agents/test-agent.md', `---
name: test-agent
description: Test agent.
---
Prompt.`);

    // Import buildWorkflowDoctorChecks lazily to avoid module load issues
    const {buildWorkflowDoctorChecks} = await import('../../src/diagnostics/extraChecks.js');
    const checks = await buildWorkflowDoctorChecks(tmpDir);

    expect(checks.length).toBeGreaterThan(0);
    const registryCheck = checks.find((c) => c.label.includes('registry'));
    expect(registryCheck).toBeDefined();
    // Trusted project should show pass for registry with loaded items
    expect(registryCheck?.detail).toContain('1 agents');
  });
});
