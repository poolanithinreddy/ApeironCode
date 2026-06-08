import {toolWasCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

const toolCase = (toolName: string, description: string) => ({
  assertions: [toolWasCalled(toolName)],
  description,
  expectedTools: [toolName],
  id: `tools-${toolName.replace(/_/gu, '-')}`,
  mode: 'chat' as const,
  prompt: `Exercise ${toolName} through the normal tool path.`,
});

export const toolsSuite: EvalSuite = {
  cases: [
    toolCase('read_file', 'Read a file.'),
    toolCase('write_file', 'Write a file.'),
    toolCase('edit_file', 'Edit a file.'),
    toolCase('patch_file', 'Patch a file.'),
    toolCase('grep', 'Search file contents.'),
    toolCase('glob', 'Find files by pattern.'),
    toolCase('run_command', 'Run a command.'),
    toolCase('git_status', 'Read git status.'),
    toolCase('test_runner', 'Run tests.'),
    toolCase('linear_get_issue', 'Connector missing config returns a clean tool error.'),
  ],
  description: 'Tool-path coverage for core tools and connector missing-config behavior.',
  id: 'tools',
};
