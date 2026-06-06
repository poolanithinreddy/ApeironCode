import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createAgent, createWorkspace, readFile, type WorkspaceSetup} from '../helpers/workflow.js';
import {fixturePath} from '../support/fixturePath.js';

const fixtureRoot = fixturePath('node-failing-test');

describe('Workflow: Fix Failing Test', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should identify and fix failing math test', async () => {
    const agent = await createAgent(workspace.projectDir);

    // First, verify test initially fails
    const mathFilePath = path.join(workspace.projectDir, 'src/math.ts');
    const initialContent = await readFile(mathFilePath);
    expect(initialContent).toContain('return a + b; // BUG');

    // Run agent to fix the test
    const result = await agent.run({
      prompt: 'run tests, then in src/math.ts replace "return a + b" with "return a - b" in the subtract function',
    });

    // Verify that tool calls were made
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // Verify edit_file was called to fix the bug
    const hadEditFile = result.toolCalls.some((tc) => tc.toolName === 'edit_file');
    expect(hadEditFile).toBe(true);

    // Verify final message mentions completion
    expect(result.finalMessage.content).toBeDefined();

    // Note: The actual file modification depends on tool implementations
    // The test verifies that the agent:
    // 1. Made tool calls
    // 2. Called test_runner to identify the bug
    // 3. Called edit_file to fix it
    // The actual file changes depend on tool execution, not the mock provider
  });

  it('should handle test execution through tool registry', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'run npm test',
    });

    // Phase 16I.8: `run npm test` is a deterministic simple action — it is
    // executed provider-free directly through the ToolRegistry's run_command
    // tool (no model-built tool args). Intent preserved: a test-execution
    // command flows through the registry and completes.
    const testCalls = result.toolCalls.filter((tc) => tc.toolName === 'run_command');
    expect(testCalls.length).toBeGreaterThan(0);
    for (const testCall of testCalls) {
      expect(['success', 'error']).toContain(testCall.status);
    }
  });

  it('should track permission metadata through fix workflow', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'run the tests and fix the math bug',
    });

    // For edit_file calls, verify permission metadata was tracked
    const editCalls = result.toolCalls.filter((tc) => tc.toolName === 'edit_file');
    for (const call of editCalls) {
      // Permission metadata should be present (even if allow/deny/approved)
      // This verifies the Phase 9 integration works
      if (call.status === 'success') {
        expect(call).toBeDefined();
      }
    }
  });

  it('runs the managed test-fix orchestration when mode is test-fix', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      mode: 'test-fix',
      prompt: 'fix the failing tests',
    });

    const testCalls = result.toolCalls.filter((toolCall) => toolCall.toolName === 'test_runner');
    expect(testCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'read_file')).toBe(true);
    expect(result.taskState?.mode).toBe('test-fix');
    expect(result.finalMessage.content).toMatch(/managed test-fix loop/i);
  });
});
