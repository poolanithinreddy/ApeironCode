import {afterEach, describe, expect, it, vi} from 'vitest';

import {createConnectorTools} from '../../src/connectors/tools.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {E2EHarness, toolChunks} from './harness.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {status: 200, statusText: 'OK'});

describe('connector tool E2E', () => {
  let harness: E2EHarness | undefined;
  const oldEnv = {...process.env};

  afterEach(async () => {
    vi.unstubAllGlobals();
    process.env = {...oldEnv};
    await harness?.cleanup();
  });

  it('returns clean missing config errors for Linear, Jira, and Slack tools', async () => {
    const registry = createDefaultToolRegistry();
    harness = await new E2EHarness({
      scripts: [
        toolChunks('linear_list_issues', {}),
        toolChunks('jira_search_issues', {jql: 'project = TEST'}),
        toolChunks('slack_list_channels', {}),
        'Connector config errors were handled.',
      ],
      toolRegistry: registry,
    }).setup();
    const run = await harness.run('Check Linear Jira and Slack issues', {mode: 'chat'});
    const output = run.toolCalls.map((toolCall) => toolCall.result?.output ?? '').join('\n');

    expect(output).toContain('LINEAR_API_KEY');
    expect(output).toContain('JIRA_HOST');
    expect(output).toContain('SLACK_BOT_TOKEN');
    expect(output).not.toContain('secret-token');
  });

  it('flows a mocked Linear fetch response through ToolRegistry into the agent loop', async () => {
    process.env.LINEAR_API_KEY = 'linear-secret-token';
    vi.stubGlobal('fetch', vi.fn(() => {
      return jsonResponse({data: {projects: {nodes: [{id: 'p1', name: 'Roadmap', url: 'https://linear.local/p1'}]}}});
    }));
    harness = await new E2EHarness({
      scripts: [toolChunks('linear_list_projects', {}), 'Linear project loaded.'],
    }).setup();
    const run = await harness.run('List Linear projects', {mode: 'chat'});

    expect(run.toolCalls[0]?.status).toBe('success');
    expect(run.toolCalls[0]?.result?.output).toContain('Roadmap');
    expect(JSON.stringify(run.toolCalls)).not.toContain('linear-secret-token');
  });

  it('marks connector write tool descriptions as side-effecting', () => {
    const tools = createConnectorTools();
    for (const name of ['linear_create_issue', 'jira_transition_issue', 'slack_send_message']) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool?.requiresApproval).toBe(true);
      expect(tool?.description.toLowerCase()).toContain('writes');
    }
  });
});
