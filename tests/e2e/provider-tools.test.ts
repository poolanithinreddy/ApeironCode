import {afterEach, describe, expect, it} from 'vitest';

import {providerRegistry} from '../../src/providers/registry.js';
import {connectorToolSchemas} from '../../src/connectors/tools.js';
import {selectToolsForPrompt} from '../../src/tools/exposurePolicy.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {E2EHarness} from './harness.js';

describe('provider and tool schema integration E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('emits provider-native tool definitions from ToolRegistry', () => {
    const registry = createDefaultToolRegistry();
    const definitions = registry.getProviderToolDefinitions();

    expect(definitions.some((definition) => definition.name === 'read_file')).toBe(true);
    expect(definitions.find((definition) => definition.name === 'read_file')?.input_schema.type).toBe('object');
  });

  it('keeps provider native format mappings available for registered providers', () => {
    const config = {
      apiKeyEnvNames: {},
      approvalMode: 'bypass' as const,
      baseUrls: {},
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
      ignoredPaths: [],
      localOnly: false,
      lsp: {enabled: false, fallbackOnFailure: true, idleTimeoutMs: 300_000, longLivedSessions: false, maxSessions: 1, requestTimeoutMs: 500},
      maxContextFiles: 4,
      maxFileSize: 200_000,
      maxFixAttempts: 3,
      maxIterations: 10,
      mcp: {servers: {}},
      memory: {autoSave: false, autoSuggest: false},
      models: {},
      permissions: [],
      planning: {autoPlanForLargeTasks: true, largeTaskThreshold: 3, requireApproval: true, requireBeforeEdit: false},
      plugins: {directories: [], disabled: []},
      sandbox: {fallbackPolicy: 'safe-readonly' as const},
      telemetry: false,
      theme: 'auto' as const,
      tokenEfficiency: {context: {maxFullFiles: 2, maxSummaryFiles: 2}, enabled: true, memory: {maxMemoryTokens: 300}, reasoningStyle: {default: 'balanced' as const}, tools: {dynamicExposureEnabled: true, maxToolOutputTokens: 350}},
      web: {allowPrivateHosts: false, enabled: false, maxFetchChars: 1000, maxSearchResults: 1, searchProvider: 'none', userAgent: 'test'},
    };

    expect(providerRegistry.create('mock', config).nativeToolFormat).toBe('anthropic');
    for (const name of ['gemini', 'azure', 'bedrock']) {
      expect(['anthropic', 'openai', 'ollama']).toContain(providerRegistry.create(name, config).nativeToolFormat);
    }
  });

  it('exposes connector tools only when policy includes connector or full mode', () => {
    const tools = createDefaultToolRegistry().list();
    const simple = selectToolsForPrompt('Explain this file', 'explain', tools);
    const slack = selectToolsForPrompt('List Slack channels', 'chat', tools);
    const full = selectToolsForPrompt('Use all tools', 'full', tools, {forceFull: true});

    expect(simple.includedTools.some((name) => name.startsWith('slack_'))).toBe(false);
    expect(slack.includedTools).toContain('slack_list_channels');
    expect(full.includedTools).toContain('linear_list_issues');
  });

  it('rejects invalid connector tool inputs through Zod schemas', () => {
    const schema = connectorToolSchemas.find((tool) => tool.name === 'linear_get_issue');
    expect(() => {
      schema?.inputSchema.parse({});
    }).toThrow();
  });

  it('does not put XML tool directives in provider messages', async () => {
    harness = await new E2EHarness({scripts: ['No XML.']}).setup();
    const run = await harness.run('Explain the project', {mode: 'explain'});
    const payload = JSON.stringify(run.providerCalls.flatMap((call) => call.messages));

    expect(payload).not.toContain('<opencode_tool_call>');
    expect(payload).not.toContain('</opencode_tool_call>');
  });
});
