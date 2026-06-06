import {createWorkflow} from './shared.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

export const buildRefactorCodeWorkflow = (input: WorkflowBuildInput): AgentWorkflow => {
  return createWorkflow({
    approach: [
      'Preserve behavior and public APIs unless the task explicitly changes them.',
      'Refactor in increments that remain easy to validate.',
      'Avoid widening scope once the first slice is working.',
      'Use tests or narrow checks to prove the refactor stayed behaviorally identical.',
    ],
    id: 'refactor-code',
    input,
    label: 'Refactor Code',
    mode: input.mode,
    steps: [
      'Identify the code smell or maintainability issue to address.',
      'Read the smallest surface that controls the current behavior.',
      'Apply a narrow structural change with no intended logic change.',
      'Rerun focused validation before making adjacent cleanups.',
    ],
    summary: 'Refactors should reduce complexity without introducing behavioral drift.',
  });
};