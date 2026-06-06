import {fileContains, noFileModified, toolWasCalled, toolWasNotCalled} from '../assertions.js';
import {createEvalWorkspace} from '../workspace.js';
import type {EvalSuite} from '../types.js';

export const codingSuite: EvalSuite = {
  cases: [
    {
      assertions: [toolWasCalled('read_file'), toolWasCalled('write_file'), fileContains('src/math.ts', 'a + b')],
      description: 'Implement a simple function from a TODO.',
      expectedTools: ['read_file', 'write_file'],
      id: 'coding-implement-todo',
      mode: 'feature',
      prompt: 'Implement add in src/math.ts.',
      setup: () => createEvalWorkspace({fixtures: {'src/math.ts': 'export const add = () => { throw new Error("TODO"); };\n'}}),
      tags: ['fixes-todo'],
    },
    {
      assertions: [toolWasCalled('read_file'), toolWasCalled('patch_file')],
      description: 'Fix a small bug with a patch.',
      expectedTools: ['read_file', 'patch_file'],
      id: 'coding-fix-bug',
      mode: 'fix',
      prompt: 'Fix the off-by-one bug.',
    },
    {
      assertions: [toolWasCalled('write_file'), toolWasCalled('test_runner')],
      description: 'Add a unit test and run it.',
      expectedTools: ['write_file', 'test_runner'],
      id: 'coding-add-unit-test',
      mode: 'test-fix',
      prompt: 'Add a unit test for add.',
    },
    {
      assertions: [toolWasCalled('edit_file'), noFileModified('README.md')],
      description: 'Refactor implementation without changing docs.',
      expectedTools: ['edit_file'],
      id: 'coding-refactor-behavior',
      mode: 'refactor',
      prompt: 'Refactor src/index.ts only.',
      setup: () => createEvalWorkspace({fixtures: {'README.md': 'Keep me\n', 'src/index.ts': 'export const value = 1;\n'}}),
    },
    {
      assertions: [toolWasCalled('read_file'), toolWasCalled('edit_file')],
      description: 'Update a TypeScript type.',
      expectedTools: ['read_file', 'edit_file'],
      id: 'coding-update-type',
      mode: 'edit',
      prompt: 'Make User.id a string.',
    },
    {
      assertions: [toolWasCalled('write_file'), fileContains('config.json', '"strict": true')],
      description: 'Patch a JSON config file.',
      expectedTools: ['write_file'],
      id: 'coding-patch-config',
      mode: 'edit',
      prompt: 'Enable strict mode in config.json.',
      setup: () => createEvalWorkspace({fixtures: {'config.json': '{"strict":false}'}}),
      tags: ['updates-config'],
    },
    {
      assertions: [toolWasCalled('patch_file'), toolWasCalled('read_file')],
      description: 'Recover from malformed tool input by retrying with valid JSON.',
      expectedTools: ['read_file', 'patch_file'],
      id: 'coding-malformed-tool-json-retry',
      mode: 'fix',
      prompt: 'Retry after malformed tool JSON.',
    },
    {
      assertions: [toolWasCalled('read_file'), toolWasNotCalled('glob')],
      description: 'Respect context-selected files.',
      expectedTools: ['read_file'],
      id: 'coding-context-selected-file',
      mode: 'edit',
      prompt: 'Use the selected file only.',
    },
  ],
  description: 'Deterministic coding-task coverage for edits, patches, tests, and context discipline.',
  id: 'coding',
};
