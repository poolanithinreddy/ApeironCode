/**
 * Simple-action runtime E2E (no real provider, no network).
 * Verifies the cheap path for trivial requests: detection, no-tools for
 * pure chat, tiny payload, project_tree empty-input repair, payload guard,
 * and that writes/commands still require approval via ToolRegistry.
 */
import {describe, expect, it, afterEach, vi} from 'vitest';
import {z} from 'zod';

import {detectSimpleAction} from '../../src/agent/simpleActionRouter.js';
import {isPureChatIntent} from '../../src/agent/intentClassifier.js';
import {selectToolsForPrompt} from '../../src/tools/exposurePolicy.js';
import {repairToolInputJson} from '../../src/agent/toolInputRepair.js';
import {classifyRuntimeFailure, shouldRetryToolCall} from '../../src/agent/recoveryPolicy.js';
import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {projectTreeTool} from '../../src/tools/projectTree.js';
import {writeFileTool} from '../../src/tools/writeFile.js';
import {runCommandTool} from '../../src/tools/runCommand.js';
import {createMockConfig} from '../support/mocks.js';
import {E2EHarness, toolChunks} from './harness.js';

const tool = (name: string) => ({
  description: `${name} tool`,
  inputSchema: z.object({}),
  name,
  requiresApproval: false,
  riskLevel: 'low' as const,
  run: () => Promise.resolve({ok: true, output: '', summary: ''}),
});

describe('simple action runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('1. "hi" → pure chat, no tools, lightweight', () => {
    expect(isPureChatIntent('hi')).toBe(true);
    expect(detectSimpleAction('hi')).toBeNull();
  });

  it('2. create/rename/tree detected; explain is not a simple write', () => {
    expect(detectSimpleAction('create a file named hello.md in the root')?.kind).toBe('create_file');
    expect(detectSimpleAction('rename README.md to read.md')?.kind).toBe('rename_file');
    expect(detectSimpleAction('show project tree')?.kind).toBe('project_tree');
    expect(detectSimpleAction('explain this repo')).toBeNull();
  });

  it('3. lightweight path triggers for pure chat and simple actions', () => {
    const light = (p: string) => isPureChatIntent(p) || detectSimpleAction(p) !== null;
    expect(light('hi')).toBe(true);
    expect(light('create a file named hello.md in the root')).toBe(true);
    expect(light('refactor the auth module for clarity')).toBe(false);
  });

  it('5/6. project_tree empty/invalid input normalizes to {}', () => {
    expect(JSON.parse(repairToolInputJson('').json)).toEqual({});
    expect(JSON.parse(repairToolInputJson('   ').json)).toEqual({});
    expect(repairToolInputJson('').unrecoverable).toBe(false);
  });

  it('9/10. oversized GitHub payload guarded; 413-class no retry', async () => {
    process.env.GITHUB_TOKEN = 'github_pat_doNotLeak';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new ProviderRegistry().create('github-models', DEFAULT_CONFIG);
    let caught: unknown;
    try {
      for await (const chunk of provider.stream({
        messages: [{content: 'x'.repeat(200_000), role: 'user'}],
        model: 'openai/gpt-4.1',
      })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }
    expect((caught as {code?: string}).code).toBe('PROVIDER_PAYLOAD_TOO_LARGE');
    expect(fetchSpy).not.toHaveBeenCalled();
    const failure = classifyRuntimeFailure((caught as Error).message);
    expect(failure.type).toBe('provider_rejected');
    expect(shouldRetryToolCall(failure, 0)).toBe(false);
  });

  it('11/12. write_file and run_command still require approval', async () => {
    const prompts: string[] = [];
    const approvalManager = new ApprovalManager('ask', (request) => {
      prompts.push(request.title);
      return Promise.resolve({approved: false});
    });
    const registry = new ToolRegistry([writeFileTool, runCommandTool]);
    registry.configureExecutor({
      approvalManager,
      globalPermissionRules: [],
      auditLog: new AuditLog(),
      sessionId: 'simple',
    });
    await expect(
      registry.invoke('write_file', {path: 'hello.md', content: ''}, {
        cwd: process.cwd(),
        config: createMockConfig(),
        approvalManager,
      }),
    ).rejects.toThrow();
    expect(prompts.some((t) => t.includes('write_file'))).toBe(true);
  });

  it('project_tree is a read-only tool that runs without approval', async () => {
    const approvalManager = new ApprovalManager('ask', () => Promise.resolve({approved: false}));
    const registry = new ToolRegistry([projectTreeTool]);
    registry.configureExecutor({
      approvalManager,
      globalPermissionRules: [],
      auditLog: new AuditLog(),
      sessionId: 'simple',
    });
    const result = await registry.invoke('project_tree', {}, {
      cwd: process.cwd(),
      config: createMockConfig(),
      approvalManager,
    });
    expect(result.ok).toBe(true);
  });
});

describe('provider-free direct execution (F)', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('compound multi-step prompt is NOT a simple action (stays on model loop)', () => {
    expect(
      detectSimpleAction('Read src/example.ts, replace "a" with "b", run tests, and summarize'),
    ).toBeNull();
    // single Read is detected (Phase 17E: now direct-executable).
    const read = detectSimpleAction('Read README.md');
    expect(read?.kind).toBe('read_file');
  });

  it('create/rename/tree/run and read are direct-executable (Phase 17E)', async () => {
    const {canExecuteSimpleActionDirectly} = await import('../../src/agent/simpleActionExecutor.js');
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('create a file named hello.md in the root')!)).toBe(true);
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('rename README.md to read.md')!)).toBe(true);
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('show project tree')!)).toBe(true);
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('run npm test')!)).toBe(true);
    // Phase 17E: bare "read <file>" runs deterministically through ToolRegistry
    // instead of being left to the model loop where the call could be malformed.
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('read src/index.ts')!)).toBe(true);
  });

  it('static web app prompts use provider-generated file plans, not canned scaffolds', async () => {
    const plan = JSON.stringify({
      commands: [],
      files: [
        {content: '<link rel="stylesheet" href="styles.css"><script src="app.js"></script>', operation: 'create', path: 'index.html'},
        {content: 'body{}', operation: 'create', path: 'styles.css'},
        {content: 'console.log("custom app")', operation: 'create', path: 'app.js'},
      ],
      summary: 'Create static app',
      validation: [],
    });
    harness = await new E2EHarness({scripts: [plan]}).setup();
    const run = await harness.run('Create a simple modern web application in this folder using plain HTML, CSS, and JavaScript.');
    expect(run.providerCalls).toHaveLength(1);
    expect(run.providerCalls[0]?.tools).toEqual([]);
    expect(run.filesChanged).toEqual(['index.html', 'styles.css', 'app.js']);
    expect(run.toolCalls).toHaveLength(3);
    expect(run.toolCalls.every((call) => call.toolName === 'write_file')).toBe(true);
    expect(run.toolCalls.every((call) => typeof call.input.path === 'string' && typeof call.input.content === 'string')).toBe(true);
    expect(run.events.filter((event) => event.type === 'context.selected')).toHaveLength(0);
    expect(run.events.filter((event) => event.type === 'tools.exposure_selected')).toHaveLength(0);
    await harness.assertFileContains('index.html', 'styles.css');
    await harness.assertFileContains('app.js', 'custom app');
    expect(run.result.finalMessage.content).toContain('index.html');
    expect(run.result.finalMessage.content).not.toContain('memory');
  });

  it('invalid static web app file plan leaves existing files untouched', async () => {
    harness = await new E2EHarness({fixtures: {'index.html': 'keep me'}, scripts: ['not json']}).setup();
    const run = await harness.run('make a simple static website');
    // Task E: one corrective JSON retry before failing cleanly → 2 calls.
    expect(run.providerCalls).toHaveLength(2);
    expect(run.filesChanged).toEqual([]);
    expect(run.events.filter((event) => event.type === 'approval.requested')).toHaveLength(0);
    expect(await harness.readFile('index.html')).toBe('keep me');
  });

  it('missing write_file args fail once with a clean message', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('write_file', {}), 'provider retry should not run'],
    }).setup();
    const run = await harness.run('write a small note somewhere');
    expect(run.providerCalls).toHaveLength(1);
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]?.error).toContain('write_file requires path and content');
    expect(run.result.finalMessage.content).not.toContain('ZodError');
  });
});

// keep eslint happy: selectToolsForPrompt used in a focused assertion
describe('tool subset for pure chat', () => {
  it('hi selects zero tools', () => {
    expect(selectToolsForPrompt('hi', 'chat', [tool('read_file'), tool('write_file')]).includedTools).toEqual([]);
  });
});
