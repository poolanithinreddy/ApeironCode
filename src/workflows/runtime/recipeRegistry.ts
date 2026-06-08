import type {WorkflowRecipe} from './types.js';

export const WORKFLOW_RECIPES: WorkflowRecipe[] = [
  {
    description: 'Reproduce and fix failing tests with narrow validation.',
    id: 'fix-tests',
    requiredTools: ['test_runner', 'read_file', 'grep', 'edit_file'],
    riskLevel: 'medium',
    stages: [
      {description: 'Run or inspect failing tests', id: 'inspect-failure', kind: 'inspect'},
      {description: 'Patch the smallest behavior change', id: 'patch', kind: 'agent'},
      {description: 'Rerun focused tests', id: 'validate', kind: 'validate'},
      {description: 'Summarize fixes and remaining risks', id: 'report', kind: 'report'},
    ],
    title: 'Fix Tests',
    validationCommands: ['npm test'],
  },
  {
    description: 'Review the current diff and report findings first.',
    id: 'review-diff',
    requiredTools: ['git_diff', 'read_file', 'grep'],
    riskLevel: 'low',
    stages: [
      {description: 'Inspect git diff', id: 'inspect-diff', kind: 'inspect'},
      {description: 'Analyze behavioral risk', id: 'review', kind: 'agent'},
      {description: 'Write findings report', id: 'report', kind: 'report'},
    ],
    title: 'Review Diff',
  },
  {
    description: 'Plan and implement a focused feature.',
    id: 'implement-feature',
    requiredTools: ['read_file', 'grep', 'edit_file', 'test_runner'],
    riskLevel: 'medium',
    stages: [
      {description: 'Plan implementation boundaries', id: 'plan', kind: 'inspect'},
      {description: 'Implement incrementally', id: 'implement', kind: 'agent'},
      {description: 'Validate narrow behavior', id: 'validate', kind: 'validate'},
      {description: 'Summarize outcome', id: 'report', kind: 'report'},
    ],
    title: 'Implement Feature',
  },
  {
    description: 'Refactor safely without changing behavior.',
    id: 'refactor-safe',
    requiredTools: ['read_file', 'grep', 'edit_file', 'test_runner'],
    riskLevel: 'medium',
    stages: [
      {description: 'Define behavior boundaries', id: 'boundaries', kind: 'inspect'},
      {description: 'Refactor incrementally', id: 'refactor', kind: 'agent'},
      {description: 'Validate behavior', id: 'validate', kind: 'validate'},
    ],
    title: 'Refactor Safe',
  },
  {
    description: 'Debug an error or stack trace.',
    id: 'debug-error',
    requiredTools: ['read_file', 'grep', 'test_runner'],
    riskLevel: 'medium',
    stages: [
      {description: 'Parse error and locate origin', id: 'triage', kind: 'inspect'},
      {description: 'Reproduce or reason from evidence', id: 'reproduce', kind: 'agent'},
      {description: 'Validate fix path', id: 'validate', kind: 'validate'},
    ],
    title: 'Debug Error',
  },
  {
    description: 'Generate focused tests for target behavior.',
    id: 'generate-tests',
    requiredTools: ['read_file', 'grep', 'write_file', 'test_runner'],
    riskLevel: 'medium',
    stages: [
      {description: 'Identify behavior and test style', id: 'inspect', kind: 'inspect'},
      {description: 'Create focused tests', id: 'write-tests', kind: 'agent'},
      {description: 'Run tests', id: 'validate', kind: 'validate'},
    ],
    title: 'Generate Tests',
  },
  {
    description: 'Audit security-sensitive paths.',
    id: 'security-audit',
    requiredTools: ['read_file', 'grep', 'git_diff'],
    riskLevel: 'low',
    stages: [
      {description: 'Map trust boundaries', id: 'map', kind: 'inspect'},
      {description: 'Inspect secrets, auth, commands, and data exposure', id: 'audit', kind: 'agent'},
      {description: 'Produce findings', id: 'report', kind: 'report'},
    ],
    title: 'Security Audit',
  },
  {
    description: 'Audit likely performance hot paths.',
    id: 'performance-audit',
    requiredTools: ['read_file', 'grep'],
    riskLevel: 'low',
    stages: [
      {description: 'Identify hot path', id: 'identify', kind: 'inspect'},
      {description: 'Analyze complexity and I/O', id: 'analyze', kind: 'agent'},
      {description: 'Report recommendations', id: 'report', kind: 'report'},
    ],
    title: 'Performance Audit',
  },
  {
    description: 'Update docs from actual behavior.',
    id: 'docs-update',
    requiredTools: ['read_file', 'grep', 'edit_file'],
    riskLevel: 'medium',
    stages: [
      {description: 'Inspect implemented behavior', id: 'inspect', kind: 'inspect'},
      {description: 'Update documentation', id: 'docs', kind: 'agent'},
      {description: 'Review docs for honesty', id: 'report', kind: 'report'},
    ],
    title: 'Docs Update',
  },
  {
    description: 'Prepare release readiness checks.',
    id: 'release-prep',
    requiredTools: ['test_runner', 'lint_runner', 'build_runner'],
    riskLevel: 'low',
    stages: [
      {description: 'Run validation gates', id: 'validate', kind: 'validate'},
      {description: 'Check package and docs readiness', id: 'readiness', kind: 'agent'},
      {description: 'Produce release report', id: 'report', kind: 'report'},
    ],
    title: 'Release Prep',
  },
];

export const listWorkflowRecipes = (): WorkflowRecipe[] => [...WORKFLOW_RECIPES];
export const getWorkflowRecipe = (id: string): WorkflowRecipe | null =>
  WORKFLOW_RECIPES.find((recipe) => recipe.id === id) ?? null;
