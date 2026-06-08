import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

import {describe, expect, it, vi} from 'vitest';

import type {Agent} from '../../src/agent/Agent.js';
import type {ConfigStore, ResolvedConfig} from '../../src/config/config.js';
import {providerRegistry} from '../../src/providers/registry.js';
import type {SessionStore} from '../../src/sessions/store.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {executeSlashCommand, listSlashCommandDefinitions, type SlashCommandContext} from '../../src/ui/slashCommands.js';
import {toDisplayString} from '../../src/utils/display.js';
import {fixturePath} from '../support/fixturePath.js';
import {createMockConfig} from '../support/mocks.js';

const createResolvedConfig = (): ResolvedConfig => {
  const effective = createMockConfig();
  return {
    effective,
    ignorePatterns: [],
    project: {},
    projectMemory: null,
    user: effective,
  };
};

const fixtureRoot = fixturePath('node-basic');

const createSlashContext = (overrides?: Partial<SlashCommandContext>) => {
  const messages: string[] = [];
  const resolvedConfig = createResolvedConfig();
  const agentRun = vi.fn(() => Promise.resolve({
    finalMessage: {
      content: 'feat: premium agent stabilization',
    },
  }));
  const runTool = vi.fn(() => Promise.resolve());
  const configStore = {
    getValue: vi.fn(),
    load: vi.fn(() => Promise.resolve(resolvedConfig)),
    patchUserConfig: vi.fn(),
    readUserConfig: vi.fn(() => Promise.resolve(resolvedConfig.user)),
    setUserValue: vi.fn(),
    writeUserConfig: vi.fn(),
  } as unknown as ConfigStore;

  const context: SlashCommandContext = {
    agent: {
      currentSession: {
        id: 'session-1',
        lastGoal: 'test provider and model slash commands',
      },
      run: agentRun,
    } as unknown as Agent,
    appendLocalAssistantMessage: (content: string) => {
      messages.push(toDisplayString(content));
    },
    configStore,
    cwd: fixtureRoot,
    exit: vi.fn(),
    getCurrentMode: vi.fn(() => 'chat' as const),
    getResolvedConfig: vi.fn(() => resolvedConfig),
    providerRegistry,
    refreshConfig: vi.fn(() => Promise.resolve()),
    refreshSessionState: vi.fn(),
    runPrompt: vi.fn(() => Promise.resolve()),
    runTool,
    sessionStore: {} as SessionStore,
    setCurrentMode: vi.fn(),
    setDashboard: vi.fn(),
    setMemoryInputMode: vi.fn(),
    setStatus: vi.fn(),
    toolRegistry: createDefaultToolRegistry(),
  };

  return {context: {...context, ...overrides}, messages, mocks: {agentRun, runTool}};
};

describe('executeSlashCommand', () => {
  it('handles provider list, setup, and test commands', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/provider list', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('mock');

    await expect(executeSlashCommand('/provider setup', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('mock provider');

    await expect(executeSlashCommand('/provider test', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Provider test:');
  });

  it('handles model list and recommend commands', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/model list', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('mock-coder');

    await expect(executeSlashCommand('/model recommend', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Recommended models for coding:');
  });

  it('routes workflow slash commands to the expected modes', async () => {
    const {context} = createSlashContext();

    await expect(executeSlashCommand('/fix investigate the crash', context)).resolves.toBe(true);
    await expect(executeSlashCommand('/debug trace the stack', context)).resolves.toBe(true);
    await expect(executeSlashCommand('/feature add a palette', context)).resolves.toBe(true);
    await expect(executeSlashCommand('/refactor simplify the renderer', context)).resolves.toBe(true);
    await expect(executeSlashCommand('/review current diff', context)).resolves.toBe(true);

    expect(context.runPrompt).toHaveBeenNthCalledWith(1, 'investigate the crash', 'fix');
    expect(context.runPrompt).toHaveBeenNthCalledWith(2, 'trace the stack', 'debug');
    expect(context.runPrompt).toHaveBeenNthCalledWith(3, 'add a palette', 'feature');
    expect(context.runPrompt).toHaveBeenNthCalledWith(4, 'simplify the renderer', 'refactor');
    expect(context.runPrompt).toHaveBeenNthCalledWith(
      5,
      'Review current diff. Report critical issues, warnings, and suggestions with concise reasoning and testing gaps.',
      'review',
    );
  });

  it('handles commit and repo slash commands', async () => {
    const {context, messages, mocks} = createSlashContext();

    await expect(executeSlashCommand('/commit', context)).resolves.toBe(true);
    expect(mocks.agentRun).toHaveBeenCalled();
    expect(mocks.runTool).toHaveBeenCalledWith('git_commit', {
      message: 'feat: premium agent stabilization',
    });

    await expect(executeSlashCommand('/repo', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('## Repo Intelligence');
  });

  it('shows lsp symbols with a live-or-fallback source label', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/lsp symbols src/example.ts', context)).resolves.toBe(true);

    expect(messages.at(-1)).toMatch(/source: (live LSP|fallback index)/u);
    expect(messages.at(-1)).not.toContain('[object Object]');
  });

  it('shows lsp diagnostics with a live-or-fallback source label', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/lsp diagnostics src/example.ts', context)).resolves.toBe(true);

    expect(messages.at(-1)).toMatch(/source: (live LSP|fallback analysis)/u);
    expect(messages.at(-1)).not.toContain('[object Object]');
  });

  it('shows lsp definition with a live-or-fallback source label', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/lsp definition src/example.ts 1 0', context)).resolves.toBe(true);

    expect(messages.at(-1)).toMatch(/source: (live LSP|fallback unavailable)/u);
    expect(messages.at(-1)).not.toContain('[object Object]');
  });

  it('shows lsp references with a live-or-fallback source label', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/lsp references src/example.ts 1 0', context)).resolves.toBe(true);

    expect(messages.at(-1)).toMatch(/source: (live LSP|fallback unavailable)/u);
    expect(messages.at(-1)).not.toContain('[object Object]');
  });

  it('shows lsp sessions and cache management output', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/lsp sessions', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('No active LSP sessions');

    await expect(executeSlashCommand('/lsp cache', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('LSP cache:');

    await expect(executeSlashCommand('/lsp cache clear', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Cleared LSP cache');
  });

  it('lists the workflow commands in the registry and /commands output', async () => {
    const {context, messages} = createSlashContext();
    const definitions = listSlashCommandDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining(['/commands', '/fix', '/review', '/feature', '/debug', '/refactor', '/commit', '/lsp', '/repo']),
    );

    await expect(executeSlashCommand('/commands', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('## Agent');
    expect(messages.at(-1)).toContain('## Memory');
    expect(messages.at(-1)).toContain('/fix <request>');
    expect(messages.at(-1)).toContain('Example: /fix failing tests');
    expect(messages.at(-1)).toContain('/commands [command]');

    await expect(executeSlashCommand('/commands memory', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('/memory');

    await expect(executeSlashCommand('/commands team', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('## Team/Cockpit');
    expect(messages.at(-1)).toContain('/team');
  });

  it('keeps the beginner command palette compact enough for terminal use', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/commands beginner', context)).resolves.toBe(true);

    const output = messages.at(-1) ?? '';
    expect(output).toContain('Command Palette — beginner');
    expect(output).toContain('/setup');
    expect(output).toContain('/explain repo');
    expect(output).toContain('/security status');
    expect(output).toContain('/commands advanced');
    expect(output.split('\n').length).toBeLessThan(45);
  });

  it('routes natural slash aliases and gives useful unknown-command suggestions', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/open dashboard', context)).resolves.toBe(true);
    expect(context.setDashboard).toHaveBeenCalledWith(null);

    await expect(executeSlashCommand('/show github', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('GitHub');

    await expect(executeSlashCommand('/totally-missing', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Try /commands beginner');
    expect(messages.at(-1)).toContain('/commands team');
  });

  it('runs slash skills through the scoped agent path', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-slash-skill-'));
    await fs.mkdir(path.join(cwd, '.apeironcode-agent/skills/explain-repo'), {recursive: true});
    await fs.writeFile(path.join(cwd, '.apeironcode-agent/skills/explain-repo/skill.json'), JSON.stringify({
      allowedTools: ['package_info'],
      description: 'Explain repo',
      examples: [],
      name: 'explain-repo',
      promptInstructions: 'Explain the repo from project metadata.',
      requiredPermissions: [],
      safetyLevel: 'low',
      tags: [],
      triggers: ['explain'],
      version: '1.0.0',
    }, null, 2));
    await fs.writeFile(path.join(cwd, '.apeironcode-agent/skills/explain-repo/skill.md'), '# explain-repo\n\nExplain the repo.\n');
    const {context, messages, mocks} = createSlashContext({cwd});

    await expect(executeSlashCommand('/skill run explain-repo summarize', context)).resolves.toBe(true);

    expect(messages[0]).toContain('Skill run plan: explain-repo');
    expect(mocks.agentRun).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'feature',
      skillName: 'explain-repo',
    }));
    expect(messages.at(-1)).toContain('feat: premium agent stabilization');

    await expect(executeSlashCommand('/skill browser repo', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Skill Browser');
  });

  it('shows provider fallback simulations and memory control output from slash commands', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/provider fallback simulate rate-limit', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Provider fallback simulation: rate-limit');

    await expect(executeSlashCommand('/memory conflicts', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Memory Conflicts');

    await expect(executeSlashCommand('/memory source missing', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Memory item not found');
  });

  it('shows helpful usage text when workflow arguments are missing', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/fix', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Example: /fix failing tests');

    await expect(executeSlashCommand('/debug', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Example: /debug paste the stack trace');

    await expect(executeSlashCommand('/feature', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Example: /feature add a dark mode toggle');

    await expect(executeSlashCommand('/refactor', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Example: /refactor src/auth.ts');
  });

  it('keeps provider doctor and context output display-safe', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/provider doctor', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Provider doctor:');
    expect(messages.at(-1)).not.toContain('[object Object]');

    await expect(executeSlashCommand('/context explain the repo', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Relevant files:');
    expect(messages.at(-1)).not.toContain('[object Object]');
  });

  it('routes team workspace and typed workflow slash commands', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-slash-phase13-'));
    const setDashboard = vi.fn();
    const {context, messages} = createSlashContext({cwd, setDashboard});

    await expect(executeSlashCommand('/team run fix tests --workspace temp-copy --dry-run', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Workspace mode: temp-copy');

    await expect(executeSlashCommand('/team workspaces', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('No subagent workspaces recorded');

    await expect(executeSlashCommand('/team cockpit team_missing', context)).resolves.toBe(true);
    expect(setDashboard).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review Cockpit: team_missing',
      type: 'review-cockpit',
    }));
    expect(messages.at(-1)).toContain('Opened review cockpit');

    await expect(executeSlashCommand('/workflow show fix-tests', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('fix-tests | Fix Tests');

    await expect(executeSlashCommand('/workflow run fix-tests --dry-run', context)).resolves.toBe(true);
    expect(messages.at(-1)).toContain('Workflow report:');
    expect(messages.at(-1)).toContain('Dry run: yes');
  });

  it('shows explicit security limits in slash commands', async () => {
    const {context, messages} = createSlashContext();

    await expect(executeSlashCommand('/security status', context)).resolves.toBe(true);

    expect(messages.at(-1)).toContain('OS sandboxing: not-enabled');
    expect(messages.at(-1)).toContain('Cloud/distributed execution: not-enabled');
  });
});
