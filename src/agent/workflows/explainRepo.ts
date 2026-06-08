import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildExplainRepoWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Start from package metadata, project tree, and repo map before diving into details.',
      'Focus on entrypoints, runtime architecture, and the developer workflow.',
      'Use relevant files to explain how the important pieces connect.',
      'Answer like a teammate onboarding to the repo, not a generic summarizer.',
    ],
    id: 'explain-repo',
    input,
    label: 'Explain Repository',
    mode: input.mode,
    steps: [
      'Identify the project type, entrypoints, and main runtime subsystems.',
      'Read the highest-signal files that define the architecture.',
      'Summarize how the major modules interact and where important workflows live.',
      'Close with the most useful commands, validation paths, or next places to read.',
    ],
    summary: 'Repo explanation should produce a crisp architecture walkthrough with useful starting points.',
  });
};