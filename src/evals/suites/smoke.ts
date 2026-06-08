import {fileContains, fileExists, iterationsBelow, toolWasCalled, toolWasNotCalled} from '../assertions.js';
import {createEvalWorkspace} from '../workspace.js';
import type {EvalSuite} from '../types.js';

export const smokeSuite: EvalSuite = {
  cases: [
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Answer a simple question without tools.',
      id: 'smoke-answer-without-tools',
      mode: 'chat',
      prompt: 'Say hello without using tools.',
    },
    {
      assertions: [toolWasCalled('read_file'), iterationsBelow(4)],
      description: 'Read a small file from the workspace.',
      expectedTools: ['read_file'],
      id: 'smoke-read-file',
      mode: 'explain',
      prompt: 'Read README.md and summarize it.',
      setup: () => createEvalWorkspace({fixtures: {'README.md': '# Demo\n'}}),
    },
    {
      assertions: [toolWasCalled('write_file'), fileExists('generated.txt'), fileContains('generated.txt', 'created by eval harness')],
      description: 'Write a new file in the eval workspace.',
      expectedTools: ['write_file'],
      id: 'smoke-write-file',
      mode: 'edit',
      prompt: 'Create generated.txt.',
      setup: () => createEvalWorkspace(),
      tags: ['writes-fixture'],
    },
    {
      assertions: [toolWasCalled('run_command'), iterationsBelow(5)],
      description: 'Run a harmless command.',
      expectedTools: ['run_command'],
      id: 'smoke-run-command',
      mode: 'chat',
      prompt: 'Run node --version.',
    },
    {
      assertions: [toolWasCalled('glob'), toolWasCalled('read_file'), iterationsBelow(5)],
      description: 'Summarize a tiny project.',
      expectedTools: ['glob', 'read_file'],
      id: 'smoke-summarize-project',
      mode: 'explain',
      prompt: 'Summarize this project.',
      setup: () => createEvalWorkspace({fixtures: {'package.json': '{"name":"demo"}', 'src/index.ts': 'export const ok = true;'}}),
    },
  ],
  description: 'Fast deterministic checks for basic agent behavior.',
  id: 'smoke',
};
