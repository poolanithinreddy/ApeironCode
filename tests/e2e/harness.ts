import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {expect} from 'vitest';

import {Agent} from '../../src/agent/Agent.js';
import type {AgentRunOptions, ToolCallRecord} from '../../src/agent/types.js';
import {ConfigStore} from '../../src/config/config.js';
import type {AgentEvent} from '../../src/core/events/events.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from '../../src/providers/types.js';
import {createDefaultToolRegistry, type ToolRegistry} from '../../src/tools/registry.js';
import {getRecentSpans} from '../../src/utils/trace.js';

export type FixtureMap = Record<string, string>;
export type StreamScript = ProviderStreamChunk[] | string;

const token = (value: string): ProviderStreamChunk => ({token: value, type: 'token'});
const done = (): ProviderStreamChunk => ({type: 'done', usage: {inputTokens: 12, outputTokens: 6, totalTokens: 18}});

export const toolChunks = (
  toolName: string,
  input: Record<string, unknown>,
  id = `tool_${toolName}_${Math.random().toString(36).slice(2)}`,
): ProviderStreamChunk[] => [
  {toolName, toolUseId: id, type: 'tool_use_start'},
  {toolInputDelta: JSON.stringify(input), toolUseId: id, type: 'tool_use_delta'},
  {toolUseId: id, type: 'tool_use_end'},
];

const normalizeScript = (script: StreamScript): ProviderStreamChunk[] =>
  typeof script === 'string' ? [token(script), done()] : script;

export class ScriptedStreamingProvider implements ModelProvider {
  readonly displayName = 'E2E Scripted Provider';
  readonly name = 'e2e-scripted';
  readonly nativeToolFormat = 'anthropic' as const;
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly calls: ProviderChatOptions[] = [];
  private index = 0;

  constructor(private readonly scripts: StreamScript[]) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['e2e-scripted']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    await Promise.resolve();
    this.calls.push(options);
    const selected = normalizeScript(this.scripts[this.index] ?? 'Done.');
    this.index += 1;
    let hasDone = false;
    for (const chunk of selected) {
      hasDone ||= chunk.type === 'done';
      yield chunk;
    }
    if (!hasDone) {
      yield done();
    }
  }
}

interface HarnessOptions {
  fixtures?: FixtureMap;
  scripts?: StreamScript[];
  toolRegistry?: ToolRegistry;
}

export class E2EHarness {
  readonly provider: ScriptedStreamingProvider;
  readonly providerRegistry = new ProviderRegistry();
  readonly toolRegistry: ToolRegistry;
  readonly events: AgentEvent[] = [];
  private previousHome: string | undefined;
  private homeDir = '';
  workspace = '';
  agent?: Agent;

  constructor(options: HarnessOptions = {}) {
    this.provider = new ScriptedStreamingProvider(options.scripts ?? ['OK']);
    this.providerRegistry.register(this.provider.name, () => this.provider);
    this.toolRegistry = options.toolRegistry ?? createDefaultToolRegistry();
    this.initialFixtures = options.fixtures ?? {};
  }

  private readonly initialFixtures: FixtureMap;

  async setup(): Promise<this> {
    this.previousHome = process.env.HOME;
    this.homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-e2e-home-'));
    this.workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-e2e-workspace-'));
    process.env.HOME = this.homeDir;
    await this.createWorkspace(this.initialFixtures);
    this.agent = await this.createAgent();
    return this;
  }

  async createWorkspace(fixtures: FixtureMap): Promise<void> {
    for (const [relativePath, content] of Object.entries(fixtures)) {
      const target = path.join(this.workspace, relativePath);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.writeFile(target, content, 'utf8');
    }
  }

  async createAgent(): Promise<Agent> {
    const store = new ConfigStore(this.workspace);
    await store.patchUserConfig({
      approvalMode: 'bypass',
      defaultModel: 'e2e-scripted',
      defaultProvider: this.provider.name,
      lsp: {enabled: false, fallbackOnFailure: true, idleTimeoutMs: 300_000, longLivedSessions: false, maxSessions: 1, requestTimeoutMs: 500},
      maxIterations: 12,
      tokenEfficiency: {
        context: {maxFullFiles: 2, maxSummaryFiles: 3},
        enabled: true,
        memory: {maxMemoryTokens: 300},
        reasoningStyle: {default: 'balanced'},
        tools: {dynamicExposureEnabled: true, maxToolOutputTokens: 350},
      },
    });
    const agent = new Agent({
      approvalHandler: () => Promise.resolve({approved: true}),
      config: await store.load(),
      cwd: this.workspace,
      providerRegistry: this.providerRegistry,
      toolRegistry: this.toolRegistry,
    });
    this.agent = agent;
    return agent;
  }

  async run(prompt: string, options: Partial<AgentRunOptions> = {}) {
    if (!this.agent) {
      await this.setup();
    }
    this.events.length = 0;
    const result = await this.agent!.run({prompt, ...options}, {
      onMessage: () => undefined,
      onStatus: () => undefined,
      onToolCall: () => undefined,
      onToolResult: () => undefined,
    });
    this.events.push(...(this.agent!.eventBus?.snapshot() ?? []));
    return {
      events: this.events,
      filesChanged: result.taskState?.filesChanged ?? [],
      messages: result.messages,
      providerCalls: this.provider.calls,
      result,
      tokenUsage: result.usage,
      toolCalls: result.toolCalls,
      traces: getRecentSpans(),
    };
  }

  async readFile(relativePath: string): Promise<string> {
    return fs.readFile(path.join(this.workspace, relativePath), 'utf8');
  }

  async assertFileContains(relativePath: string, pattern: RegExp | string): Promise<void> {
    const content = await this.readFile(relativePath);
    if (typeof pattern === 'string') {
      expect(content).toContain(pattern);
    } else {
      expect(content).toMatch(pattern);
    }
  }

  getToolCall(name: string): ToolCallRecord | undefined {
    return this.agent?.toolCalls.find((toolCall) => toolCall.toolName === name);
  }

  async cleanup(): Promise<void> {
    process.env.HOME = this.previousHome;
    for (const target of [this.homeDir, this.workspace]) {
      if (target && path.relative(os.tmpdir(), target).startsWith('opencode-e2e-')) {
        await fs.rm(target, {force: true, recursive: true});
      }
    }
  }
}
