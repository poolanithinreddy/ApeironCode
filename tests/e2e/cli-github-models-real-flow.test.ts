/**
 * End-to-end GitHub Models real-user flow (no network, no real keys).
 * Mocks fetch for the provider; verifies setup, compact startup, clean 401
 * handling, no memory prompt on auth failure, and approval policy.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {applySetupProfile} from '../../src/setup/setup.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import {buildChatRequestBody} from '../../src/providers/openaiCompatible.js';
import {runProviderSmokeTest} from '../../src/diagnostics/doctor.js';
import {formatCompactHome} from '../../src/ui/welcomeDashboard.js';
import {runProducedUsefulEvidence} from '../../src/agent/runMemory.js';
import {classifyRuntimeFailure, shouldRetryToolCall} from '../../src/agent/recoveryPolicy.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {projectTreeTool} from '../../src/tools/projectTree.js';
import {editFileTool} from '../../src/tools/editFile.js';
import {createMockConfig} from '../support/mocks.js';

const TOKEN = 'github_pat_11SECRETflowTokenDoNotLeak1234567890';

describe('GitHub Models real-user flow', () => {
  const originalHome = process.env.HOME;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-flow-home-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-flow-proj-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('setup with a present token saves config and reports ready', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const status = await applySetupProfile(new ConfigStore(cwd), {provider: 'github-models'});
    expect(status.defaultProvider).toBe('github-models');
    expect(status.defaultModel).toBe('openai/gpt-4.1');
    expect(status.nextSteps.join('\n')).toContain('configured and ready');
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  it('compact startup shows provider/model and no stale branding', () => {
    const out = formatCompactHome({
      provider: 'github-models',
      model: 'openai/gpt-4.1',
      version: '0.1.0',
      workspacePath: cwd,
    });
    expect(out).toContain('ApeironCode');
    expect(out).toContain('github-models/openai/gpt-4.1');
    expect(out).not.toContain('Workspace Home');
    expect(out.toLowerCase()).not.toContain('opencode');
    expect(out).not.toContain('mock-coder');
    expect(out.split('\n').length).toBeLessThanOrEqual(15);
  });

  it('a mocked 401 yields a clean auth error and never retries', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(`nope ${TOKEN}`, {status: 401}))),
    );
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: 'hi', role: 'user'}],
        model: 'openai/gpt-4.1',
        temperature: 0,
      })) {
        void chunk; /* unreachable */
      }
    } catch (error) {
      caught = error;
    }
    const message = (caught as Error).message;
    expect(message).toContain('authentication failed');
    expect(message).not.toContain(TOKEN);

    const failure = classifyRuntimeFailure(message);
    expect(failure.type).toBe('auth_failed');
    expect(shouldRetryToolCall(failure, 0)).toBe(false);
  });

  it('an auth-failed run does not produce a memory-save prompt', () => {
    expect(
      runProducedUsefulEvidence({
        finalMessage: {content: 'GitHub Models authentication failed.', role: 'assistant', id: 'm', createdAt: ''},
        messages: [],
        plan: undefined,
        taskState: undefined,
        toolCalls: [],
        usage: {inputTokens: 0, outputTokens: 0, totalTokens: 0},
      } as unknown as Parameters<typeof runProducedUsefulEvidence>[0]),
    ).toBe(false);
  });

  it('a mocked 400 maps to a safe payload error and no memory prompt', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({error: {message: 'Unknown field: max_completion_tokens', code: 'invalid_request'}}),
            {status: 400},
          ),
        ),
      ),
    );
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: 'hi', role: 'user'}],
        model: 'openai/gpt-4.1',
      })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }
    const message = (caught as Error).message;
    expect((caught as {code?: string}).code).toBe('PROVIDER_BAD_REQUEST');
    expect(message).toContain('Unknown field');
    expect(message).not.toContain(TOKEN);

    const failure = classifyRuntimeFailure(message);
    expect(failure.type).toBe('provider_rejected');
    expect(shouldRetryToolCall(failure, 0)).toBe(false);
    expect(
      runProducedUsefulEvidence({
        finalMessage: {content: message, role: 'assistant', id: 'm', createdAt: ''},
        messages: [],
        plan: undefined,
        taskState: undefined,
        toolCalls: [],
        usage: {inputTokens: 0, outputTokens: 0, totalTokens: 0},
      } as unknown as Parameters<typeof runProducedUsefulEvidence>[0]),
    ).toBe(false);
  });

  it('"hi" sends no tools and matches the minimal curl shape', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [
          {role: 'system', content: 'big system prompt'},
          {role: 'user', content: 'hi'},
        ],
        stream: true,
        tools: [{name: 'package_info', description: 'p', input_schema: {type: 'object'}}],
      },
      'github-models',
    );
    expect('tools' in body).toBe(false);
    expect(body.messages.some((m) => m.role === 'user' && m.content === 'hi')).toBe(true);
  });

  it('tools sent for a real task are GitHub-valid object schemas', () => {
    const body = buildChatRequestBody(
      {
        model: 'openai/gpt-4.1',
        messages: [{role: 'user', content: 'edit the readme title please'}],
        stream: true,
        tools: [{name: 'package_info', description: 'p', input_schema: {type: 'object'}}],
      },
      'github-models',
    );
    const tools = body.tools as Array<{function: {parameters: Record<string, unknown>}}>;
    expect(tools[0]!.function.parameters).toEqual({type: 'object', properties: {}, required: []});
  });

  it('provider smoke returns PASS for GitHub-style content', async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"Hello! How can I help you today?"}}]}\n\ndata: [DONE]\n\n',
            {status: 200, headers: {'content-type': 'text/event-stream'}},
          ),
        ),
      ),
    );
    const store = new ConfigStore(cwd);
    await applySetupProfile(store, {provider: 'github-models'});
    const smoke = await runProviderSmokeTest({
      config: await store.load(),
      providerRegistry: new ProviderRegistry(),
      providerOverride: 'github-models',
    });
    expect(smoke.status).toBe('pass');
    expect(JSON.stringify(smoke)).not.toContain(TOKEN);
  });

  it('read-only project_tree needs no approval; edit_file asks', async () => {
    const prompts: string[] = [];
    const approvalManager = new ApprovalManager('ask', (request) => {
      prompts.push(request.title);
      return Promise.resolve({approved: false});
    });
    const registry = new ToolRegistry([projectTreeTool, editFileTool]);
    registry.configureExecutor({
      approvalManager,
      globalPermissionRules: [],
      auditLog: new AuditLog(),
      sessionId: 'gh-flow',
    });
    const tree = await registry.invoke('project_tree', {depth: 1}, {
      cwd,
      config: createMockConfig(),
      approvalManager,
    });
    expect(tree.ok).toBe(true);
    expect(prompts).toHaveLength(0);

    await expect(
      registry.invoke('edit_file', {path: 'README.md', search: 'a', replace: 'b'}, {
        cwd,
        config: createMockConfig(),
        approvalManager,
      }),
    ).rejects.toThrow();
    expect(prompts).toContain('Execute Tool: edit_file');
  });
});
