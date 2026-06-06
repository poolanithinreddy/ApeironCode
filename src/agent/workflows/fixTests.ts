import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildFixTestsWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Treat the failing test output as the primary source of truth.',
      'Read the failing tests and the owning implementation before editing.',
      'Keep fixes narrow because the runtime will rerun tests after each attempt.',
      'Stop once the failing path is green instead of refactoring opportunistically.',
    ],
    id: 'fix-tests',
    input,
    label: 'Fix Tests',
    mode: input.mode,
    steps: [
      'Run the project tests and capture the first failing path.',
      'Read the failing tests and their owning source files.',
      'Apply the smallest viable fix for the observed failure.',
      'Rerun the same tests before widening validation.',
    ],
    summary: 'Test-fix mode should stay surgical and let the managed loop handle reruns.',
  });
};