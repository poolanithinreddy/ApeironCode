export interface QualityWorkflow {
  description: string;
  name: string;
  steps: string[];
}

export const QUALITY_WORKFLOWS: QualityWorkflow[] = [
  {description: 'Plan, implement, validate, and summarize a feature.', name: 'implement-feature', steps: ['plan', 'inspect', 'edit', 'validate', 'summarize', 'learn']},
  {description: 'Reproduce and fix failing tests.', name: 'fix-tests', steps: ['run tests', 'isolate failure', 'patch', 'rerun focused tests', 'summarize']},
  {description: 'Debug an error or stack trace.', name: 'debug-error', steps: ['parse error', 'find origin', 'reproduce', 'patch', 'validate']},
  {description: 'Review the current diff.', name: 'review-diff', steps: ['inspect diff', 'find risks', 'check tests', 'report findings']},
  {description: 'Refactor safely without behavior changes.', name: 'refactor-safely', steps: ['plan boundaries', 'edit incrementally', 'run tests', 'review diff']},
  {description: 'Generate tests for a target behavior.', name: 'generate-tests', steps: ['identify behavior', 'write focused tests', 'run tests', 'summarize coverage']},
  {description: 'Upgrade a dependency with validation.', name: 'upgrade-dependency', steps: ['inspect manifest', 'plan upgrade', 'update', 'run tests', 'document risk']},
  {description: 'Audit security-sensitive paths.', name: 'security-audit', steps: ['map trust boundaries', 'inspect secrets/auth/commands', 'report findings']},
  {description: 'Audit performance hot paths.', name: 'performance-audit', steps: ['identify hot path', 'measure or reason', 'recommend changes']},
  {description: 'Update docs from real behavior.', name: 'docs-update', steps: ['inspect feature', 'update docs', 'verify commands']},
  {description: 'Prepare release readiness.', name: 'release-prep', steps: ['typecheck', 'lint', 'test', 'build', 'pack dry-run', 'security checklist']},
];

export const formatWorkflowList = (): string =>
  QUALITY_WORKFLOWS.map((workflow) => `${workflow.name} | ${workflow.description}`).join('\n');

export const formatWorkflowRun = (name: string, task: string): string => {
  const workflow = QUALITY_WORKFLOWS.find((candidate) => candidate.name === name);
  if (!workflow) {
    return `Unknown workflow: ${name}`;
  }
  return [
    `Workflow: ${workflow.name}`,
    `Task: ${task}`,
    workflow.description,
    '',
    ...workflow.steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
};
