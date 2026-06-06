import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createAgent, createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';

const fixtureRoot = path.resolve(
  '/Users/nithinreddy/Documents/opencode/tests/fixtures/node-failing-test',
);

describe('Workflow: Multi-Turn Iterations', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should handle multi-step error recovery', async () => {
    const agent = await createAgent(workspace.projectDir);

    // First run: identify the problem
    const step1 = await agent.run({
      prompt: 'run npm test to see what fails',
    });

    expect(step1.toolCalls.length).toBeGreaterThan(0);
    expect(step1.finalMessage.content).toBeDefined();

    // Step 2: inspect the source
    const step2 = await agent.run({
      prompt: 'read src/math.ts and identify the bug in the subtract function',
    });

    expect(step2.toolCalls.length).toBeGreaterThan(0);

    // Should detect the bug through file read
    const toolNames = step2.toolCalls.map((tc) => tc.toolName);
    expect(toolNames.includes('read_file')).toBe(true);
  });

  it('should not hang on max iterations', async () => {
    const agent = await createAgent(workspace.projectDir);

    // Ask for something that might cause many iterations
    const start = Date.now();
    const result = await agent.run({
      prompt: 'explain this repository and all its files',
    });
    const duration = Date.now() - start;

    // Should complete in reasonable time (not hang)
    expect(duration).toBeLessThan(30000); // 30 seconds max

    // Should have a final message
    expect(result.finalMessage.content).toBeDefined();

    // Should not have excessive tool calls
    expect(result.toolCalls.length).toBeLessThan(50);
  });

  it('should track multiple tool calls in sequence', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'read src/math.ts, then read tests/math.test.ts, then summarize differences',
    });

    // Should have multiple tool calls
    expect(result.toolCalls.length).toBeGreaterThan(1);

    // All should complete (success or error)
    for (const call of result.toolCalls) {
      expect(['success', 'error']).toContain(call.status);
    }

    // Final summary should be present
    expect(result.finalMessage.content).toBeDefined();
  });

  it('should handle tool failures without hanging', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'try to read a nonexistent file /nonexistent/path.ts, then explain the error',
    });

    // Agent should complete
    expect(result.finalMessage.content).toBeDefined();

    // Should have attempted the failing operation
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });

  it('should maintain context across multiple prompts', async () => {
    const agent = await createAgent(workspace.projectDir);

    // First interaction
    const result1 = await agent.run({
      prompt: 'what programming language is this project',
    });

    expect(result1.finalMessage.content).toBeDefined();
    const messageCount1 = agent.messages.length;

    // Second interaction in same session
    const result2 = await agent.run({
      prompt: 'what are the main files',
    });

    expect(result2.finalMessage.content).toBeDefined();
    const messageCount2 = agent.messages.length;

    // Messages should accumulate across turns
    expect(messageCount2).toBeGreaterThan(messageCount1);
  });

  it('should handle approval denial in multi-turn flow', async () => {
    let denialCount = 0;
    const agent = await createAgent(workspace.projectDir, {
      approvalHandler: () => {
        denialCount++;
        // First approval denied, then approved
        return Promise.resolve({approved: denialCount > 1});
      },
    });

    const result = await agent.run({
      prompt: 'make changes to the code',
    });

    // Should complete even with denial
    expect(result.finalMessage.content).toBeDefined();
  });

  it('should provide clear summaries after multi-turn workflows', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'read the package.json, explain what scripts are available, list the test command',
    });

    // Final message should be comprehensive
    expect(result.finalMessage.content.length).toBeGreaterThan(50);

    // Should mention relevant details from execution
    expect(result.finalMessage.content).toMatch(/execution|summary|test|script/i);
  });
});
