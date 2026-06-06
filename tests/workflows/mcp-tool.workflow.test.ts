import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createAgent, createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';

const fixtureRoot = path.resolve(
  '/Users/nithinreddy/Documents/opencode/tests/fixtures/mcp-workspace',
);

describe('Workflow: MCP Tool Execution', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace(fixtureRoot);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('loads MCP tools from project config and invokes them', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'use the mcp echo tool to say hello from mcp',
    });

    expect(result.toolCalls.some((toolCall) => toolCall.toolName === 'mcp:echo-test.echo')).toBe(true);
    expect(result.toolCalls.some((toolCall) => toolCall.status === 'success')).toBe(true);
    expect(result.finalMessage.content).toContain('mcp:echo-test.echo');
  });

  it('surfaces MCP tool failures in the workflow loop', async () => {
    const agent = await createAgent(workspace.projectDir);

    const result = await agent.run({
      prompt: 'trigger the mcp fail tool',
    });

    const failedToolCall = result.toolCalls.find((toolCall) => toolCall.toolName === 'mcp:echo-test.fail');
    expect(failedToolCall?.status).toBe('error');
    expect(failedToolCall?.error).toContain('Intentional MCP failure');
  });
});