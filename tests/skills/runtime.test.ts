import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Agent} from '../../src/agent/Agent.js';
import {ConfigStore} from '../../src/config/config.js';
import {createStarterSkill} from '../../src/skills/generator.js';
import {buildSkillRunPlan} from '../../src/skills/runner.js';
import {SkillStore} from '../../src/skills/store.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

const fixtureRoot = path.resolve('/Users/nithinreddy/Documents/opencode/tests/fixtures/node-basic');

describe('skill runtime execution', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-skill-home-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-skill-project-'));
    await fs.cp(fixtureRoot, projectDir, {recursive: true});
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('executes a skill through the agent with a scoped tool registry', async () => {
    const skillStore = new SkillStore(projectDir);
    const generated = createStarterSkill('explain-repo');
    const skill = await skillStore.save({
      ...generated.metadata,
      allowedTools: ['package_info', 'project_tree'],
    }, generated.markdown);
    const configStore = new ConfigStore(projectDir);
    await configStore.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
    });
    const toolRegistry = createDefaultToolRegistry();
    toolRegistry.setAllowedTools([...skill.metadata.allowedTools, 'package_info', 'project_tree']);
    const agent = new Agent({
      config: await configStore.load(),
      cwd: projectDir,
      providerRegistry,
      toolRegistry,
    });

    const result = await agent.run({
      allowModeInference: false,
      mode: 'feature',
      prompt: buildSkillRunPlan(skill, 'Explain this repo').prompt,
      skillName: skill.metadata.name,
      verbose: true,
    });

    expect(result.finalMessage.content).toContain('Execution summary:');
    expect(agent.currentSession.sessionMemory?.finalResult).toContain('Execution summary:');
  });

  it('blocks undeclared tools during a skill run', async () => {
    const configStore = new ConfigStore(projectDir);
    await configStore.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
    });
    const toolRegistry = createDefaultToolRegistry();
    toolRegistry.setAllowedTools(['package_info', 'project_tree']);
    const agent = new Agent({
      config: await configStore.load(),
      cwd: projectDir,
      providerRegistry,
      toolRegistry,
    });

    const result = await agent.run({
      allowModeInference: false,
      mode: 'feature',
      prompt: 'Run tests for this project',
      skillName: 'locked-skill',
    });

    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'test_runner' && toolCall.status === 'error')).toBe(true);
    expect(result.finalMessage.content).toContain('I stopped after');
  });
});
