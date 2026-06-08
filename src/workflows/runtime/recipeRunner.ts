import crypto from 'node:crypto';

import {Agent} from '../../agent/Agent.js';
import type {AgentMode} from '../../agent/types.js';
import type {ResolvedConfig} from '../../config/config.js';
import {MemorySuggestionStore} from '../../memory/suggestions.js';
import {providerRegistry} from '../../providers/registry.js';
import {createDefaultToolRegistry} from '../../tools/registry.js';
import {getWorkflowRecipe} from './recipeRegistry.js';
import {WorkflowReportStore} from './reports.js';
import type {WorkflowRecipe, WorkflowRunReport} from './types.js';

const modeForRecipe = (recipe: WorkflowRecipe): AgentMode => {
  switch (recipe.id) {
    case 'debug-error':
      return 'debug';
    case 'fix-tests':
      return 'test-fix';
    case 'review-diff':
    case 'security-audit':
    case 'performance-audit':
      return 'review';
    case 'refactor-safe':
      return 'refactor';
    default:
      return 'feature';
  }
};

export const formatWorkflowRecipe = (recipe: WorkflowRecipe): string => [
  `${recipe.id} | ${recipe.title} | risk=${recipe.riskLevel}`,
  recipe.description,
  `Required tools: ${recipe.requiredTools?.join(', ') || 'none'}`,
  `Required skills: ${recipe.requiredSkills?.join(', ') || 'none'}`,
  '',
  'Stages:',
  ...recipe.stages.map((stage, index) => `${index + 1}. ${stage.id} (${stage.kind}) — ${stage.description}`),
].join('\n');

export const formatWorkflowRecipeList = (recipes: WorkflowRecipe[]): string =>
  recipes.map((recipe) => `${recipe.id} | ${recipe.title} | ${recipe.description}`).join('\n');

export const runWorkflowRecipe = async (input: {
  config: ResolvedConfig;
  cwd: string;
  dryRun?: boolean;
  recipeId: string;
  task: string;
}): Promise<WorkflowRunReport> => {
  const recipe = getWorkflowRecipe(input.recipeId);
  if (!recipe) {
    throw new Error(`Unknown workflow: ${input.recipeId}`);
  }
  const id = `workflow_${crypto.randomUUID()}`;
  const stageRows = recipe.stages.map((stage) => ({
    id: stage.id,
    status: input.dryRun ? 'planned' as const : 'completed' as const,
  }));
  let resultSummary = input.dryRun
    ? formatWorkflowRecipe(recipe)
    : '';

  if (!input.dryRun) {
    const toolRegistry = createDefaultToolRegistry();
    if (recipe.requiredTools?.length) {
      toolRegistry.setAllowedTools(Array.from(new Set([...recipe.requiredTools, 'package_info', 'project_tree', 'git_diff'])));
    }
    const agent = new Agent({
      config: input.config,
      cwd: input.cwd,
      providerRegistry,
      toolRegistry,
    });
    const prompt = [
      formatWorkflowRecipe(recipe),
      '',
      `Task: ${input.task}`,
      '',
      'Execute the recipe with the available tools. Respect approvals, inspect before editing, validate narrowly, and produce a report.',
    ].join('\n');
    const run = await agent.run({
      allowModeInference: false,
      mode: modeForRecipe(recipe),
      model: input.config.effective.defaultModel,
      prompt,
      providerName: input.config.effective.defaultProvider,
      // Workflow reports are machine artifacts — keep the full execution
      // summary (terminal UX declutter does not apply to recipe reports).
      verbose: true,
    });
    resultSummary = run.finalMessage.content.trim();
    await new MemorySuggestionStore(input.cwd).append({
      confidence: 'medium',
      proposedFacts: [{
        confidence: 0.72,
        metadata: {recipeId: recipe.id, workflowRunId: id},
        name: `${recipe.id}: ${input.task}`.slice(0, 120),
        observation: resultSummary.slice(0, 600),
        source: 'session',
        tags: ['workflow', 'suggested'],
        type: 'task',
      }],
      source: 'agent-run',
      summary: `Workflow ${recipe.id} completed: ${input.task}`,
    });
  }

  const report: WorkflowRunReport = {
    createdAt: new Date().toISOString(),
    dryRun: Boolean(input.dryRun),
    id,
    recipeId: recipe.id,
    resultSummary,
    stages: stageRows,
    task: input.task,
  };
  return new WorkflowReportStore(input.cwd).save(report);
};
