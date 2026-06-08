import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import type {ResolvedConfig} from '../../src/config/config.js';
import {MemorySuggestionStore} from '../../src/memory/suggestions.js';
import {getWorkflowRecipe, listWorkflowRecipes} from '../../src/workflows/runtime/recipeRegistry.js';
import {formatWorkflowRecipe, runWorkflowRecipe} from '../../src/workflows/runtime/recipeRunner.js';
import {WorkflowReportStore} from '../../src/workflows/runtime/reports.js';
import {createMockConfig} from '../support/mocks.js';

const createConfig = (): ResolvedConfig => ({
  effective: createMockConfig(),
  ignorePatterns: [],
  project: {},
  projectMemory: null,
  user: createMockConfig(),
});

describe('workflow runtime recipes', () => {
  it('registers typed built-in recipes', () => {
    expect(listWorkflowRecipes().map((recipe) => recipe.id)).toContain('fix-tests');
    const recipe = getWorkflowRecipe('fix-tests');
    expect(recipe?.stages.length).toBeGreaterThan(2);
    expect(formatWorkflowRecipe(recipe!)).toContain('Required tools');
  });

  it('creates dry-run and runtime reports with mock provider', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-workflow-runtime-'));
    await fs.cp(path.resolve('tests/fixtures/node-basic'), cwd, {recursive: true});
    const dry = await runWorkflowRecipe({
      config: createConfig(),
      cwd,
      dryRun: true,
      recipeId: 'fix-tests',
      task: 'fix tests',
    });
    expect(dry.dryRun).toBe(true);
    expect(dry.stages.every((stage) => stage.status === 'planned')).toBe(true);

    const report = await runWorkflowRecipe({
      config: createConfig(),
      cwd,
      recipeId: 'review-diff',
      task: 'review diff',
    });
    expect(report.dryRun).toBe(false);
    expect(report.resultSummary).toContain('Execution summary');
    expect(await new WorkflowReportStore(cwd).get(report.id)).toMatchObject({id: report.id});
    expect(await new MemorySuggestionStore(cwd).list()).not.toHaveLength(0);
  });
});
