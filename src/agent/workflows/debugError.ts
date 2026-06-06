import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildDebugErrorWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Reproduce or inspect the failure before changing code.',
      'Trace the failure to the owning function, file, or command.',
      'Make the smallest fix that resolves the root cause.',
      'Verify with the narrowest failing check before broad validation.',
    ],
    id: 'debug-error',
    input,
    label: 'Debug Error',
    mode: input.mode,
    steps: [
      'Capture the error, stack trace, or failing behavior.',
      'Read the code path that directly controls the failure.',
      'Confirm the defect with the cheapest discriminating check.',
      'Apply a targeted repair and rerun the same check.',
    ],
    summary: 'Debugging should stay anchored to the failing path and converge on a minimal root-cause fix.',
  });
};