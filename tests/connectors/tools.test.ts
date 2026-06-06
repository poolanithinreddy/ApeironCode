import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {connectorToolSchemas, createConnectorTools} from '../../src/connectors/tools.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {toolSchemaToProviderDefinition} from '../../src/tools/schema.js';

describe('connector ToolRegistry integration', () => {
  it('registers connector tools in the default ToolRegistry and provider definitions', () => {
    const registry = createDefaultToolRegistry();
    const names = registry.list().map((tool) => tool.name);

    expect(names).toContain('linear_list_issues');
    expect(names).toContain('jira_search_issues');
    expect(names).toContain('slack_send_message');
    expect(registry.getProviderToolDefinitions().map((tool) => tool.name)).toContain('github_list_issues');
  });

  it('uses ToolSchema and Zod schemas for connector tools', () => {
    const schema = connectorToolSchemas.find((tool) => tool.name === 'linear_get_issue');

    expect(schema).toBeDefined();
    expect(schema?.inputSchema).toBeInstanceOf(z.ZodObject);
    expect(toolSchemaToProviderDefinition(schema!).input_schema).toMatchObject({type: 'object'});
  });

  it('validates input and returns clean missing-config tool errors', async () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get('linear_get_issue');

    expect(() => {
      tool.inputSchema.parse({});
    }).toThrow();
    const result = await registry.invoke('linear_get_issue', {id: 'ENG-1'}, {
      // Minimal context is enough because connector clients read env and return missing-config errors.
      approvalManager: {} as never,
      config: {} as never,
      cwd: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('LINEAR_API_KEY');
    expect(result.output).not.toContain('secret');
  });

  it('marks write tools as approval-requiring and side-effecting in descriptions', () => {
    const writeTools = createConnectorTools().filter((tool) =>
      ['linear_create_issue', 'jira_add_comment', 'slack_send_message', 'github_add_comment'].includes(tool.name),
    );

    expect(writeTools.every((tool) => tool.requiresApproval === true)).toBe(true);
    expect(writeTools.every((tool) => /writes|create|comment|send|update|transition/iu.test(tool.description))).toBe(true);
  });
});
