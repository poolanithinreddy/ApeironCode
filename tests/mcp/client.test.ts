import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpClient} from '../../src/mcp/client.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

const getEchoServerPath = (): string => {
  return path.join(testDir, '../../examples/mcp/echo-server/server.js');
};

describe('MCP Client', () => {
  let client: McpClient;

  beforeEach(() => {
    client = new McpClient();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should initialize connection to MCP server', async () => {
    await client.connect({
      type: 'stdio',
      command: 'node',
      args: [getEchoServerPath()],
      env: {},
      name: 'echo',
    }, process.cwd());

    // If we get here without error, initialization succeeded
    expect(client).toBeDefined();
  }, 10000);

  it('should list tools from MCP server', async () => {
    await client.connect({
      type: 'stdio',
      command: 'node',
      args: [getEchoServerPath()],
      env: {},
      name: 'echo',
    }, process.cwd());

    const tools = await client.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === 'echo')).toBe(true);
  }, 10000);

  it('should call tool on MCP server', async () => {
    await client.connect({
      type: 'stdio',
      command: 'node',
      args: [getEchoServerPath()],
      env: {},
      name: 'echo',
    }, process.cwd());

    const response = await client.callTool('echo', {text: 'hello'});
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(Array.isArray(response.content)).toBe(true);
  }, 10000);
});
