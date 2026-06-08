import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {loadCommandDefinition, loadCommandDefinitions} from '../../src/workflows/commands/loader.js';

vi.mock('../../src/safety/projectTrust.js', () => ({
  getProjectTrustStatus: vi.fn().mockReturnValue({trust: 'untrusted', warnings: []}),
  markProjectTrusted: vi.fn(),
  markProjectUntrusted: vi.fn(),
  requiresTrustForAction: vi.fn().mockReturnValue({requiresTrust: false, action: '', reason: ''}),
  formatProjectTrustWarning: vi.fn().mockReturnValue(''),
}));

import {getProjectTrustStatus} from '../../src/safety/projectTrust.js';

const mkdtemp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-cmd-test-'));

const writeCommand = (dir: string, name: string, content: string): string => {
  const commandsDir = path.join(dir, '.apeironcode', 'commands');
  fs.mkdirSync(commandsDir, {recursive: true});
  const filePath = path.join(commandsDir, `${name}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
};

describe('loadCommandDefinition', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('loads a valid command', () => {
    const content = `---
name: review-pr
description: Review current branch and prepare PR notes.
aliases: [pr-review, pr]
argumentHint: "[base-branch]"
allowedTools: [git_diff, read_file, grep_search]
permissionMode: strict
requiresTrust: true
---

Review the current changes against {{args}}.
Focus on correctness, tests, and security.`;
    const filePath = writeCommand(tmpDir, 'review-pr', content);
    const result = loadCommandDefinition(filePath, 'project');

    expect(result.definition).not.toBeNull();
    expect(result.definition?.name).toBe('review-pr');
    expect(result.definition?.description).toBe('Review current branch and prepare PR notes.');
    expect(result.definition?.aliases).toEqual(['pr-review', 'pr']);
    expect(result.definition?.argumentHint).toBe('[base-branch]');
    expect(result.definition?.allowedTools).toEqual(['git_diff', 'read_file', 'grep_search']);
    expect(result.definition?.permissionMode).toBe('strict');
    expect(result.definition?.requiresTrust).toBe(true);
    expect(result.definition?.body).toContain('{{args}}');
  });

  it('rejects missing name', () => {
    const content = `---
description: No name.
---
Body.`;
    const filePath = writeCommand(tmpDir, 'noname', content);
    const result = loadCommandDefinition(filePath, 'project');
    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('rejects missing description', () => {
    const content = `---
name: nodesc
---
Body.`;
    const filePath = writeCommand(tmpDir, 'nodesc', content);
    const result = loadCommandDefinition(filePath, 'project');
    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'description')).toBe(true);
  });

  it('parses aliases correctly', () => {
    const content = `---
name: my-cmd
description: A command with aliases.
aliases: [mc, mycmd]
---
Body.`;
    const filePath = writeCommand(tmpDir, 'my-cmd', content);
    const result = loadCommandDefinition(filePath, 'project');
    expect(result.definition?.aliases).toEqual(['mc', 'mycmd']);
  });
});

describe('loadCommandDefinitions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    vi.resetAllMocks();
  });

  it('returns empty when no commands dir', () => {
    const results = loadCommandDefinitions(tmpDir);
    expect(results).toHaveLength(0);
  });

  it('blocks command with requiresTrust for untrusted project', () => {
    writeCommand(tmpDir, 'guarded', `---
name: guarded
description: Trust-guarded command.
requiresTrust: true
---
Do something.`);
    const results = loadCommandDefinitions(tmpDir);
    expect(results[0]?.trustStatus).toBe('blocked');
    expect(results[0]?.definition).toBeNull();
    expect(results[0]?.issues[0]?.message).toContain('requires trust');
  });

  it('allows command without requiresTrust for untrusted project', () => {
    writeCommand(tmpDir, 'open-cmd', `---
name: open-cmd
description: Open command.
requiresTrust: false
---
Do something safe.`);
    const results = loadCommandDefinitions(tmpDir);
    expect(results[0]?.definition?.name).toBe('open-cmd');
    expect(results[0]?.trustStatus).toBe('allowed');
  });

  it('allows all commands for trusted project', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
    writeCommand(tmpDir, 'trusted-cmd', `---
name: trusted-cmd
description: Trusted command.
requiresTrust: true
---
Trusted.`);
    const results = loadCommandDefinitions(tmpDir);
    expect(results[0]?.definition?.name).toBe('trusted-cmd');
    expect(results[0]?.trustStatus).toBe('allowed');
  });

  it('allows load with skipTrustCheck', () => {
    writeCommand(tmpDir, 'skip-trust-cmd', `---
name: skip-trust-cmd
description: Skip trust check.
requiresTrust: true
---
Body.`);
    const results = loadCommandDefinitions(tmpDir, {skipTrustCheck: true});
    expect(results[0]?.definition?.name).toBe('skip-trust-cmd');
    expect(results[0]?.trustStatus).toBe('allowed');
  });
});
