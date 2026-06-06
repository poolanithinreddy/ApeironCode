import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Agent} from '../../src/agent/Agent.js';
import {ConfigStore} from '../../src/config/config.js';
import {HookEventLog} from '../../src/hooks/eventLog.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

const fixtureRoot = path.resolve('/Users/nithinreddy/Documents/opencode/tests/fixtures/node-basic');

describe('runtime hooks', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-hook-home-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-hook-project-'));
    await fs.cp(fixtureRoot, projectDir, {recursive: true});
    await fs.mkdir(path.join(projectDir, '.apeironcode-agent'), {recursive: true});
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('fires hook events around real agent session and tool execution', async () => {
    await fs.writeFile(path.join(projectDir, '.apeironcode-agent', 'hooks.json'), JSON.stringify({
      hooks: [
        {enabled: true, event: 'session_start', name: 'start-note', type: 'built-in'},
        {enabled: true, event: 'before_tool', name: 'before-tool-note', type: 'built-in'},
        {enabled: true, event: 'after_tool', name: 'after-tool-note', type: 'built-in'},
        {enabled: true, event: 'session_complete', name: 'complete-note', type: 'built-in'},
      ],
    }));
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
    });
    const agent = new Agent({
      config: await store.load(),
      cwd: projectDir,
      providerRegistry,
      toolRegistry: createDefaultToolRegistry(),
    });

    await agent.run({prompt: 'Explain this repo'});

    const events = await new HookEventLog(projectDir).list();
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining([
      'session_start',
      'before_tool',
      'after_tool',
      'session_complete',
    ]));
    expect(events.every((event) => event.ok)).toBe(true);
  });
});
