import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {buildProjectContext} from '../../src/agent/context.js';
import {ConfigStore} from '../../src/config/config.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {upsertMemoryFact} from '../../src/memory/graph.js';
import {MemoryGraphStore} from '../../src/memory/graphStore.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {fixturePath} from '../support/fixturePath.js';

const fixtureRoot = fixturePath('node-basic');

describe('agent prompt context integration', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-context-home-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-context-project-'));
    await fs.cp(fixtureRoot, projectDir, {recursive: true});
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('includes repo-brain summaries and related memory graph facts in prompt context', async () => {
    const configStore = new ConfigStore(projectDir);
    await configStore.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
    });
    const graphStore = new MemoryGraphStore(projectDir);
    await graphStore.save(upsertMemoryFact(await graphStore.load(), {
      name: 'src/example.ts',
      observation: 'Example module is covered by the basic fixture test.',
      source: 'user',
      type: 'file',
    }));
    const config = await configStore.load();
    const approvalManager = new ApprovalManager('bypass');
    const context = await buildProjectContext({
      approvalManager,
      config,
      cwd: projectDir,
      mode: 'debug',
      prompt: 'Fix src/example.ts tests',
      toolRegistry: createDefaultToolRegistry(),
    });

    expect(context.promptContext).toContain('Repo brain packed context:');
    expect(context.promptContext).toContain('Memory graph:');
    expect(context.promptContext).toContain('src/example.ts');
    expect(context.contextSelectionSummary).toContain('Token budget');
    expect(context.contextSelectionExplanation).toContain('Context selection');
    expect(context.memoryGraphSummary).toContain('src/example.ts');
  });
});
