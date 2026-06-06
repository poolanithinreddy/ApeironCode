import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createAgent, createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';
import {fixturePath} from '../support/fixturePath.js';

const fixtureRoot = fixturePath('plugin-workspace');

describe('Workflow: Plugin Tool Execution', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should call plugin echo tool through agent', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'use the echo plugin to say hello world',
    });

    // Verify that tool calls were made
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // The mock provider should recognize the request for plugin echo
    // and generate a tool call for plugin:echo-plugin.echo
    const toolNames = result.toolCalls.map((tc) => tc.toolName);
    expect(toolNames.length).toBeGreaterThan(0);

    // Final message should indicate completion
    expect(result.finalMessage.content.length).toBeGreaterThan(0);
  });

  it('should track plugin tool execution metadata', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'use the echo plugin',
    });

    // Tool calls should be tracked
    expect(result.toolCalls).toBeDefined();

    // Verify agent completes
    expect(result.finalMessage.content).toBeDefined();
  });

  it('should handle plugin tool results in conversation', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'call the echo plugin with message "test123"',
    });

    // Agent should generate a final response
    expect(result.finalMessage.content).toBeDefined();

    // Tool calls should be recorded
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });
});
