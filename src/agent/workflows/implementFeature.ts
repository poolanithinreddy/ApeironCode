import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildImplementFeatureWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Confirm the owning abstraction and nearby call sites before editing.',
      'Prefer a small vertical slice that ships working behavior quickly.',
      'Update only the files needed for the requested feature.',
      'Validate the touched behavior before expanding the change.',
    ],
    id: 'implement-feature',
    input,
    label: 'Implement Feature',
    mode: input.mode,
    steps: [
      'Identify the entrypoint, state owner, and validation surface.',
      'Read the relevant files and any neighboring tests or examples.',
      'Implement the smallest complete version of the requested behavior.',
      'Run focused validation and iterate only if the new behavior still fails.',
    ],
    summary: 'Feature work should feel intentional, minimal, and fully verified on the touched path.',
  });
};