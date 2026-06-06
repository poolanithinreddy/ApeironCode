import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {loadAgentDefinition, loadAgentDefinitions, formatAgentDefinition} from '../../src/workflows/agents/loader.js';

// Mock projectTrust to control trust level
vi.mock('../../src/safety/projectTrust.js', () => ({
  getProjectTrustStatus: vi.fn().mockReturnValue({trust: 'untrusted', warnings: []}),
  markProjectTrusted: vi.fn(),
  markProjectUntrusted: vi.fn(),
  requiresTrustForAction: vi.fn().mockReturnValue({requiresTrust: false, action: '', reason: ''}),
  formatProjectTrustWarning: vi.fn().mockReturnValue(''),
}));

import {getProjectTrustStatus} from '../../src/safety/projectTrust.js';

const mkdtemp = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-agent-test-'));

const writeAgent = (dir: string, name: string, content: string): string => {
  const agentsDir = path.join(dir, '.apeironcode', 'agents');
  fs.mkdirSync(agentsDir, {recursive: true});
  const filePath = path.join(agentsDir, `${name}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
};

describe('loadAgentDefinition', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('loads a valid project agent', () => {
    const content = `---
name: code-reviewer
description: Reviews code changes.
tools: [read_file, grep_search]
disallowedTools: [write_file]
permissionMode: strict
maxTurns: 8
---

You are a careful code reviewer.`;
    const filePath = writeAgent(tmpDir, 'code-reviewer', content);
    const result = loadAgentDefinition(filePath, 'project');

    expect(result.definition).not.toBeNull();
    expect(result.definition?.name).toBe('code-reviewer');
    expect(result.definition?.description).toBe('Reviews code changes.');
    expect(result.definition?.tools).toEqual(['read_file', 'grep_search']);
    expect(result.definition?.disallowedTools).toEqual(['write_file']);
    expect(result.definition?.permissionMode).toBe('strict');
    expect(result.definition?.maxTurns).toBe(8);
    expect(result.definition?.body).toContain('careful code reviewer');
    expect(result.trustStatus).toBe('allowed');
  });

  it('rejects missing name', () => {
    const content = `---
description: No name here.
---
Body.`;
    const filePath = writeAgent(tmpDir, 'noname', content);
    const result = loadAgentDefinition(filePath, 'project');

    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
    expect(result.trustStatus).toBe('blocked');
  });

  it('rejects missing description', () => {
    const content = `---
name: my-agent
---
Body.`;
    const filePath = writeAgent(tmpDir, 'nodesc', content);
    const result = loadAgentDefinition(filePath, 'project');

    expect(result.definition).toBeNull();
    expect(result.issues.some((i) => i.field === 'description')).toBe(true);
  });

  it('disallowedTools override included tools (builder records both)', () => {
    const content = `---
name: safe-reader
description: Read only.
tools: [read_file, write_file]
disallowedTools: [write_file]
---
Prompt.`;
    const filePath = writeAgent(tmpDir, 'safe-reader', content);
    const result = loadAgentDefinition(filePath, 'project');

    expect(result.definition?.tools).toContain('read_file');
    expect(result.definition?.disallowedTools).toContain('write_file');
    // Both are recorded; enforcement is at execution time
  });
});

describe('loadAgentDefinitions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtemp();
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'untrusted', warnings: []});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    vi.resetAllMocks();
  });

  it('returns empty array when no agents dir', () => {
    const results = loadAgentDefinitions(tmpDir);
    expect(results).toHaveLength(0);
  });

  it('blocks agents for untrusted project', () => {
    writeAgent(tmpDir, 'my-agent', `---\nname: my-agent\ndescription: test\n---\nBody.`);
    const results = loadAgentDefinitions(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]?.trustStatus).toBe('blocked');
    expect(results[0]?.definition).toBeNull();
    expect(results[0]?.issues[0]?.message).toContain('not trusted');
  });

  it('loads agents for trusted project', () => {
    vi.mocked(getProjectTrustStatus).mockReturnValue({cwd: tmpDir, trust: 'trusted', warnings: []});
    writeAgent(tmpDir, 'my-agent', `---\nname: my-agent\ndescription: A trusted agent\n---\nBody.`);
    const results = loadAgentDefinitions(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]?.definition?.name).toBe('my-agent');
    expect(results[0]?.trustStatus).toBe('allowed');
  });

  it('allows load when skipTrustCheck is true', () => {
    writeAgent(tmpDir, 'skip-agent', `---\nname: skip-agent\ndescription: Skipped trust check\n---\nBody.`);
    const results = loadAgentDefinitions(tmpDir, {skipTrustCheck: true});
    expect(results).toHaveLength(1);
    expect(results[0]?.definition?.name).toBe('skip-agent');
    expect(results[0]?.trustStatus).toBe('allowed');
  });
});

describe('formatAgentDefinition', () => {
  it('formats agent without secrets', () => {
    const result = loadAgentDefinition(
      (() => {
        const tmpDir = mkdtemp();
        const content = `---
name: fmt-agent
description: Test formatting.
tools: [read_file]
permissionMode: strict
---
Body.`;
        const fp = writeAgent(tmpDir, 'fmt-agent', content);
        return fp;
      })(),
      'project',
    );

    if (!result.definition) {
      expect.fail('Expected definition to be loaded');
    }

    const formatted = formatAgentDefinition(result.definition);
    expect(formatted).toContain('fmt-agent');
    expect(formatted).toContain('Test formatting');
    expect(formatted).toContain('strict');
    // No body in formatted output
    expect(formatted).not.toContain('Body.');
  });
});
