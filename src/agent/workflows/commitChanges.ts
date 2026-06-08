import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildCommitChangesWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Inspect the diff first and derive the commit message from the actual changes.',
      'Prefer concise, high-signal phrasing over enumerating every file.',
      'Call out validation gaps if the diff looks risky.',
      'Do not invent scope that is not present in the working tree.',
    ],
    id: 'commit-changes',
    input,
    label: 'Commit Changes',
    mode: input.mode,
    steps: [
      'Read the current diff or status summary.',
      'Identify the dominant change type and outcome.',
      'Draft a compact commit message grounded in the diff.',
      'Only proceed to commit if the working tree matches the message.',
    ],
    summary: 'Commit mode should stay grounded in the diff and produce a message the user would actually keep.',
  });
};