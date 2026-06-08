import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildReviewDiffWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Inspect the diff before offering judgments.',
      'Prioritize bugs, regressions, and missing validation over style comments.',
      'Tie every finding to a concrete file, behavior, or test gap.',
      'Keep the summary short after the findings are clear.',
    ],
    id: 'review-diff',
    input,
    label: 'Review Diff',
    mode: input.mode,
    steps: [
      'Read the current diff or changed files.',
      'Inspect the surrounding implementation only where the diff depends on it.',
      'List findings in severity order with concrete reasoning.',
      'Call out residual risks or missing tests when no direct bug is found.',
    ],
    summary: 'Review mode should read like a precise code review, not a changelog or a general summary.',
  });
};