import {describe, expect, it} from 'vitest';

import {buildChatRequestBody} from '../../src/providers/openaiCompatible.js';
import {
  extractToolSchemaNameFromProviderError,
  sanitizeOpenAICompatibleTools,
  sanitizeOpenAICompatibleToolsWithWarnings,
  validateOpenAICompatibleTool,
} from '../../src/providers/toolSchemaSanitizer.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

const TOKEN = 'sk-proj-secret-token-that-must-not-leak';

const parametersOf = (toolName: string): Record<string, unknown> => {
  const registry = createDefaultToolRegistry();
  const body = buildChatRequestBody(
    {
      model: 'gpt-4o',
      messages: [{role: 'user', content: `use ${toolName}`}],
      stream: true,
      tools: registry.getProviderToolDefinitionsFor([toolName]),
    },
    'openai',
  );
  const tool = body.tools?.[0];
  expect(validateOpenAICompatibleTool(tool)).toBe(true);
  return (tool as {function: {parameters: Record<string, unknown>}}).function.parameters;
};

describe('sanitizeOpenAICompatibleTools', () => {
  it('normalizes empty object schemas for OpenAI-compatible providers', () => {
    const tools = sanitizeOpenAICompatibleTools([
      {type: 'function', function: {name: 'package_info', description: 'pkg', parameters: {type: 'object'}}},
      {type: 'function', function: {name: 'project_tree', description: 'tree'}},
    ]);
    expect(tools).toHaveLength(2);
    expect(tools[0]?.function.parameters).toEqual({type: 'object', properties: {}, required: []});
    expect(tools[1]?.function.parameters).toEqual({type: 'object', properties: {}, required: []});
  });

  it('sanitizes real revert_patch and package_info tool schemas', () => {
    expect(parametersOf('revert_patch')).toMatchObject({
      type: 'object',
      properties: {},
      required: [],
    });
    expect(parametersOf('package_info')).toEqual({
      type: 'object',
      properties: {},
      required: [],
    });
  });

  it('strips unsupported metadata and drops invalid tools safely', () => {
    const result = sanitizeOpenAICompatibleToolsWithWarnings([
      {type: 'function', function: {name: 'valid_tool', description: 'd', parameters: {type: 'object', $schema: 'draft', $defs: {}, definitions: {}}}},
      {type: 'function', function: {name: 'bad space', description: TOKEN, parameters: {type: 'object'}}},
      {type: 'function', function: {name: 'bad_params', description: 'd', parameters: {type: 'string'}}},
    ]);
    expect(result.tools.map((tool) => tool.function.name)).toEqual(['valid_tool']);
    const params = result.tools[0]?.function.parameters as Record<string, unknown>;
    expect(params.$schema).toBeUndefined();
    expect(params.$defs).toBeUndefined();
    expect(params.definitions).toBeUndefined();
    expect(JSON.stringify(result.warnings)).not.toContain(TOKEN);
  });

  it('extracts provider schema rejection tool names when present', () => {
    const name = extractToolSchemaNameFromProviderError(
      JSON.stringify({error: {message: "Invalid schema for function 'revert_patch': object schema missing properties", param: 'tools[7].function.parameters'}}),
    );
    expect(name).toBe('revert_patch');
  });
});
