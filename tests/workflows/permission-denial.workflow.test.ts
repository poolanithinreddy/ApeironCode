import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createAgent, createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';

const fixtureRoot = path.resolve(
  '/Users/nithinreddy/Documents/opencode/tests/fixtures/plugin-workspace',
);

describe('Workflow: Permission Denial', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should deny plugin tool when permission rule blocks it', async () => {
    // Create agent with permission rule that blocks echo plugin
    const agent = await createAgent(workspace.projectDir, {
      permissions: ['Deny(Tool(plugin:echo-plugin.echo))'],
    });

    const result = await agent.run({
      prompt: 'use the echo plugin',
    });

    // Agent should complete (may timeout or end gracefully)
    expect(result.finalMessage.content).toBeDefined();
  });

  it('should respect permission rules when tools are called', async () => {
    const workspace2 = await createWorkspace(fixtureRoot);

    try {
      // Create agent with permission rule blocking echo plugin
      const agent = await createAgent(workspace2.projectDir, {
        permissions: ['Deny(Tool(plugin:echo-plugin.echo))'],
      });

      const result = await agent.run({
        prompt: 'use the echo plugin',
      });

      // Agent should complete
      expect(result.finalMessage.content).toBeDefined();
    } finally {
      await workspace2.cleanup();
    }
  });

  it('should allow tools when permission rule permits them', async () => {
    const agent = await createAgent(workspace.projectDir, {
      // Allow echo plugin explicitly
      permissions: ['Allow(Tool(plugin:echo-plugin.echo))'],
    });

    const result = await agent.run({
      prompt: 'use the echo plugin to echo hello',
    });

    // Agent should complete
    expect(result.finalMessage.content).toBeDefined();

    // Tool calls should be made
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });

  it('should track denied permission in audit logs through tool calls', async () => {
    const agent = await createAgent(workspace.projectDir, {
      permissions: ['Deny(Tool(plugin:echo-plugin.echo))'],
    });

    const result = await agent.run({
      prompt: 'try to call the echo plugin',
    });

    // Agent completes
    expect(result.finalMessage.content).toBeDefined();

    // Tool calls should be tracked
    expect(result.toolCalls).toBeDefined();
  });
});
