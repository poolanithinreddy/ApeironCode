import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {formatTeamPlan} from '../../src/agents/format.js';
import {listAgents} from '../../src/agents/registry.js';
import {runSubagentDryRun} from '../../src/agents/subagentRunner.js';
import {createTeamPlan} from '../../src/agents/teamPlanner.js';
import {runTeamSequential} from '../../src/agents/teamRunner.js';
import type {ResolvedConfig} from '../../src/config/config.js';
import {MemorySuggestionStore} from '../../src/memory/suggestions.js';
import {createMockConfig} from '../support/mocks.js';

describe('agent teams', () => {
  it('lists built-ins and creates sequential team plans', () => {
    expect(listAgents().map((agent) => agent.name)).toContain('reviewer');
    expect(runSubagentDryRun('reviewer', 'review diff').summary).toContain('scoped tools');
    const plan = createTeamPlan('fix tests');
    expect(plan.steps.map((step) => step.agent)).toEqual(['planner', 'coder', 'tester', 'reviewer']);
    expect(formatTeamPlan(plan)).toContain('fix tests');
  });

  it('executes sequential subagents with scoped tools and records memory suggestions', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-team-'));
    await fs.cp(path.resolve('tests/fixtures/node-basic'), cwd, {recursive: true});
    const config: ResolvedConfig = {
      effective: createMockConfig(),
      ignorePatterns: [],
      project: {},
      projectMemory: null,
      user: createMockConfig(),
    };

    const result = await runTeamSequential('explain this repo', {config, cwd, workspaceMode: 'temp-copy'});

    expect(result.results.map((entry) => entry.agent)).toEqual(['planner', 'coder', 'tester', 'reviewer']);
    expect(result.ok).toBe(true);
    expect(result.workspaceMode).toBe('temp-copy');
    expect(result.summary).toContain('planner');
    expect(result.results[0]?.toolsAllowed).toContain('read_file');
    expect(result.results[0]?.workspaceRoot).not.toBe(cwd);
    expect(result.workspaceDiffs).toHaveLength(4);
    expect(await new MemorySuggestionStore(cwd).list()).toHaveLength(1);
  });
});
