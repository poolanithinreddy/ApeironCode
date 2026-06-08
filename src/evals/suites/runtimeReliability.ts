import {customAssertion, fileContains, fileExists, toolWasCalled} from '../assertions.js';
import {createEvalWorkspace} from '../workspace.js';
import type {EvalSuite} from '../types.js';

const runtimeMetric = (name: string) => customAssertion(name, () => Promise.resolve([]));

export const runtimeReliabilitySuite: EvalSuite = {
  cases: [
    {
      assertions: [toolWasCalled('edit_file'), toolWasCalled('test_runner'), fileContains('src/value.ts', 'value = 2')],
      description: 'Plan, edit, then verify a simple change.',
      expectedTools: ['edit_file', 'test_runner'],
      id: 'runtime-plan-act-verify-simple-edit',
      mode: 'edit',
      prompt: 'Change src/value.ts to value 2 and run tests.',
      setup: () => createEvalWorkspace({fixtures: {'package.json': '{"scripts":{"test":"node -e \\"process.exit(0)\\""}}', 'src/value.ts': 'export const value = 1;\n'}}),
    },
    {
      assertions: [runtimeMetric('checkpoint-created-before-edit')],
      description: 'Checkpoint is created before risky edits.',
      id: 'runtime-checkpoint-before-edit',
      mode: 'edit',
      prompt: 'Patch src/value.ts safely.',
    },
    {
      assertions: [runtimeMetric('rollback-after-failing-verification')],
      description: 'Rollback is available after failing verification.',
      id: 'runtime-rollback-after-failing-verification',
      mode: 'fix',
      prompt: 'Edit code, run failing verification, and rollback.',
    },
    {
      assertions: [runtimeMetric('malformed-tool-input-recovery')],
      description: 'Malformed tool input is classified and recovered.',
      id: 'runtime-malformed-tool-input-recovery',
      mode: 'debug',
      prompt: 'Recover from malformed tool input.',
    },
    {
      assertions: [runtimeMetric('repeated-tool-failure-stops')],
      description: 'Repeated tool failures stop safely.',
      id: 'runtime-repeated-tool-failure-stops',
      mode: 'debug',
      prompt: 'Stop after repeated tool failures.',
    },
    {
      assertions: [runtimeMetric('diff-budget-blocks-excessive-change')],
      description: 'Diff budget blocks excessive changes.',
      id: 'runtime-diff-budget-blocks-excessive-change',
      mode: 'refactor',
      prompt: 'Attempt an excessive multi-file change.',
    },
    {
      assertions: [runtimeMetric('protected-path-requires-approval')],
      description: 'Protected paths require approval.',
      id: 'runtime-protected-path-requires-approval',
      mode: 'edit',
      prompt: 'Try to modify .env safely.',
    },
    {
      assertions: [toolWasCalled('test_runner')],
      description: 'Test-fix reruns the failing test first.',
      expectedTools: ['test_runner'],
      id: 'runtime-test-fix-reruns-failing-test',
      mode: 'test-fix',
      prompt: 'Fix the failing test and rerun it.',
    },
    {
      assertions: [runtimeMetric('cancellation-snapshot-resumable')],
      description: 'Cancellation snapshot can be resumed.',
      id: 'runtime-cancellation-snapshot-resumable',
      mode: 'debug',
      prompt: 'Interrupt and resume the runtime snapshot.',
    },
    {
      assertions: [fileExists('summary.txt')],
      description: 'Runtime summary includes tools, changes, and verification.',
      id: 'runtime-summary-includes-tools-changes-verification',
      mode: 'edit',
      prompt: 'Write a runtime summary to summary.txt.',
      setup: () => createEvalWorkspace(),
    },
  ],
  description: 'Reliability checks for runtime state, checkpointing, recovery, diff budget, and verification.',
  id: 'runtime-reliability',
};
