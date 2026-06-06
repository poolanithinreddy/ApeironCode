import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Agent} from '../../src/agent/Agent.js';
import {ConfigStore} from '../../src/config/config.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {fixturePath} from '../support/fixturePath.js';

const fixtureRoot = fixturePath('node-basic');

describe('Agent integration with mock provider', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-agent-home-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-agent-project-'));
    await fs.cp(fixtureRoot, projectDir, {recursive: true});
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('handles a multi-step read/edit/test loop with the mock provider', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
    });
    const config = await store.load();
    const agent = new Agent({
      config,
      cwd: projectDir,
      providerRegistry,
      toolRegistry: createDefaultToolRegistry(),
    });

    const result = await agent.run({
      prompt:
        'Read src/example.ts, replace "value = 1" with "value = 2", run tests, and summarize the result.',
    });

    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'read_file')).toBe(true);
    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'edit_file')).toBe(true);
    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'test_runner')).toBe(true);

    const content = await fs.readFile(path.join(projectDir, 'src/example.ts'), 'utf8');
    expect(content).toContain('value = 2');
    expect(result.finalMessage.content).toContain('Execution summary:');
  });
});
