import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {loadProjectWorkflows} from '../../src/workflows/registry.js';

vi.mock('../../src/safety/projectTrust.js', () => ({
  getProjectTrustStatus: vi.fn().mockReturnValue({trust: 'trusted', warnings: []}),
  markProjectTrusted: vi.fn(),
  markProjectUntrusted: vi.fn(),
  requiresTrustForAction: vi.fn().mockReturnValue({requiresTrust: false, action: '', reason: ''}),
  formatProjectTrustWarning: vi.fn().mockReturnValue(''),
}));

import {getProjectTrustStatus} from '../../src/safety/projectTrust.js';

const mkdtemp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-registry-test-'));

const writeFile = (dir: string, rel: string, content: string): void => {
  const fullPath = path.join(dir, rel);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, content, 'utf8');
};

const TRUSTED_AGENT = `---
name: my-agent
description: A useful agent.
tools: [read_file]
permissionMode: strict
---
You are a helpful agent.`;

const TRUSTED_SKILL = `---
name: my-skill
description: A useful skill.
whenToUse: skill keyword
---
Skill body.`;

const TRUSTED_COMMAND = `---
name: my-command
description: A useful command.
aliases: [mc, my-cmd]
requiresTrust: false
---
Do {{args}}.`;

describe('WorkflowRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    vi.resetAllMocks();
  });

  it('lists agents, skills, and commands after loading', () => {
    writeFile(tmpDir, '.apeironcode/agents/my-agent.md', TRUSTED_AGENT);
    writeFile(tmpDir, '.apeironcode/skills/my-skill/SKILL.md', TRUSTED_SKILL);
    writeFile(tmpDir, '.apeironcode/commands/my-command.md', TRUSTED_COMMAND);

    const registry = loadProjectWorkflows(tmpDir);
    const summary = registry.listWorkflowDefinitions();

    expect(summary.agents).toHaveLength(1);
    expect(summary.agents[0]?.name).toBe('my-agent');
    expect(summary.skills).toHaveLength(1);
    expect(summary.skills[0]?.name).toBe('my-skill');
    expect(summary.commands).toHaveLength(1);
    expect(summary.commands[0]?.name).toBe('my-command');
  });

  it('finds command by alias', () => {
    writeFile(tmpDir, '.apeironcode/commands/my-command.md', TRUSTED_COMMAND);
    const registry = loadProjectWorkflows(tmpDir);
    const cmd = registry.findCommand('mc');
    expect(cmd?.name).toBe('my-command');
    const cmd2 = registry.findCommand('my-cmd');
    expect(cmd2?.name).toBe('my-command');
  });

  it('finds command by name', () => {
    writeFile(tmpDir, '.apeironcode/commands/my-command.md', TRUSTED_COMMAND);
    const registry = loadProjectWorkflows(tmpDir);
    expect(registry.findCommand('my-command')?.name).toBe('my-command');
  });

  it('returns undefined for unknown command', () => {
    const registry = loadProjectWorkflows(tmpDir);
    expect(registry.findCommand('nonexistent')).toBeUndefined();
  });

  it('blocks untrusted project workflows', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});
    writeFile(tmpDir, '.apeironcode/agents/blocked-agent.md', TRUSTED_AGENT);
    writeFile(tmpDir, '.apeironcode/skills/blocked-skill/SKILL.md', TRUSTED_SKILL);

    const registry = loadProjectWorkflows(tmpDir);
    const summary = registry.listWorkflowDefinitions();
    expect(summary.agents).toHaveLength(0);
    expect(summary.skills).toHaveLength(0);
    expect(summary.blocked.length).toBeGreaterThan(0);
  });

  it('warns on duplicate agent names', () => {
    writeFile(tmpDir, '.apeironcode/agents/dup.md', TRUSTED_AGENT);
    writeFile(tmpDir, '.apeironcode/agents/dup2.md', TRUSTED_AGENT); // same name different file

    const registry = loadProjectWorkflows(tmpDir);
    const issues = registry.validateWorkflows();
    expect(issues.some((i) => i.message.includes('duplicate'))).toBe(true);
  });

  it('trusted project workflows are loaded via skipTrustCheck', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});
    writeFile(tmpDir, '.apeironcode/commands/my-command.md', TRUSTED_COMMAND);

    const registry = loadProjectWorkflows(tmpDir, {skipTrustCheck: true});
    const summary = registry.listWorkflowDefinitions();
    // Command has requiresTrust: false so even without trust it's allowed
    expect(summary.commands[0]?.name).toBe('my-command');
  });
});
