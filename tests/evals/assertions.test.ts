import {describe, expect, it} from 'vitest';

import {
  commandFails,
  commandSucceeds,
  customAssertion,
  fileContains,
  fileExists,
  fileNotContains,
  fileNotExists,
  iterationsBelow,
  noFileModified,
  toolWasCalled,
  toolWasNotCalled,
} from '../../src/evals/assertions.js';
import {createToolCallRecord} from '../../src/evals/harness.js';
import type {EvalAssertion, EvalResult, EvalWorkspace} from '../../src/evals/types.js';
import {createEvalWorkspace, snapshotWorkspaceFiles} from '../../src/evals/workspace.js';

const run = async (assertion: EvalAssertion, workspace: EvalWorkspace, result?: Partial<EvalResult>) => {
  const initialFiles = await snapshotWorkspaceFiles(workspace);
  return assertion.run({
    initialFiles,
    result: {
      durationMs: 0,
      failures: [],
      filesChanged: [],
      id: 'case',
      passed: true,
      tokenEfficiency: {
        estimatedContextTokens: 0,
        estimatedInputTokens: 0,
        estimatedMemoryTokens: 0,
        estimatedOutputTokens: 0,
        estimatedToolResultTokens: 0,
        estimatedToolSchemaTokens: 0,
        successPer1kTokens: 0,
        toolCallsPer1kTokens: 0,
        totalEstimatedTokens: 0,
      },
      toolCalls: [],
      ...result,
    },
    workspace,
  });
};

describe('eval assertions', () => {
  it('checks files and content patterns', async () => {
    const workspace = await createEvalWorkspace({fixtures: {'a.txt': 'hello world\n'}});
    try {
      expect(await run(fileExists('a.txt'), workspace)).toEqual([]);
      expect(await run(fileNotExists('missing.txt'), workspace)).toEqual([]);
      expect(await run(fileContains('a.txt', /world/u), workspace)).toEqual([]);
      expect(await run(fileNotContains('a.txt', 'secret'), workspace)).toEqual([]);
      expect(await run(fileContains('a.txt', 'absent'), workspace)).toHaveLength(1);
    } finally {
      await workspace.cleanup();
    }
  });

  it('checks commands, file modification, tools, iterations, and custom assertions', async () => {
    const workspace = await createEvalWorkspace({fixtures: {'a.txt': 'stable\n'}});
    try {
      expect(await run(commandSucceeds(process.execPath, ['-e', 'process.exit(0)']), workspace)).toEqual([]);
      expect(await run(commandFails(process.execPath, ['-e', 'process.exit(2)']), workspace)).toEqual([]);
      expect(await run(noFileModified('a.txt'), workspace)).toEqual([]);
      expect(await run(toolWasCalled('read_file'), workspace, {toolCalls: [createToolCallRecord('read_file')]})).toEqual([]);
      expect(await run(toolWasNotCalled('write_file'), workspace, {toolCalls: [createToolCallRecord('read_file')]})).toEqual([]);
      expect(await run(iterationsBelow(3), workspace, {iterations: 2})).toEqual([]);
      expect(await run(customAssertion('custom', () => Promise.resolve([])), workspace)).toEqual([]);
      await workspace.writeFile('a.txt', 'changed\n');
      expect(await run(noFileModified('a.txt'), workspace)).toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });
});
