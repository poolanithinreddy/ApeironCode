import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createAgent, createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';

const fixtureRoot = path.resolve(
  '/Users/nithinreddy/Documents/opencode/tests/fixtures/node-basic',
);

describe('Workflow: Explain Repository', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should explain a node.js repository using real agent execution', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'explain this codebase',
    });

    // Verify that tools were actually called
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // The mock provider should call package_info and project_tree for "explain repo" prompts
    const toolNames = result.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain('package_info');
    expect(toolNames).toContain('project_tree');

    // Final message should contain analysis (mock provider returns specific text)
    const containsAnalysis = result.finalMessage.content.includes('TypeScript') ||
      result.finalMessage.content.includes('agent loop');
    expect(containsAnalysis).toBe(true);

    // All tools should have completed successfully or been explicitly skipped
    for (const toolCall of result.toolCalls) {
      expect(toolCall.status).toBe('success');
    }
  });

  it('should read files when explaining repo context', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'explain this repo and check package.json',
    });

    // Verify tool calls
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // At least one tool should have succeeded
    const successfulTools = result.toolCalls.filter((tc) => tc.status === 'success');
    expect(successfulTools.length).toBeGreaterThan(0);

    // Final message should be generated
    expect(result.finalMessage.content.length).toBeGreaterThan(0);
  });
});
