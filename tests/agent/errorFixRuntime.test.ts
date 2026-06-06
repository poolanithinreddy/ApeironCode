import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {runErrorFix, searchWorkspace} from '../../src/agent/errorFixRuntime.js';
import {detectErrorPaste} from '../../src/agent/errorPasteIntent.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {createSession} from '../../src/agent/session.js';
import {createMockConfig} from '../support/mocks.js';
import {EventBus} from '../../src/core/events/bus.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import type {ModelProvider, ProviderStreamChunk} from '../../src/providers/types.js';

const stubSessionStore = {save: () => Promise.resolve()} as never;
const taskState = () =>
  ({commandsRun: [], errors: [], filesChanged: [], filesRead: [], testsRun: [], todos: []}) as never;

const fakeProvider = (text: string): ModelProvider =>
  ({
    name: 'fake',
    displayName: 'Fake',
    nativeToolFormat: 'anthropic',
    supportsStreaming: true,
    supportsToolCalling: true,
    listModels: () => Promise.resolve(['fake']),
    async *stream(): AsyncGenerator<ProviderStreamChunk> {
      await Promise.resolve();
      yield {token: text, type: 'token'};
      yield {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}};
    },
  });

describe('searchWorkspace', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'efr-'));
    await fs.mkdir(path.join(cwd, 'pages'), {recursive: true});
    await fs.mkdir(path.join(cwd, 'node_modules/pkg'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'pages/index.js'), 'const c = theme.bodyBackgroundColor;');
    await fs.writeFile(path.join(cwd, 'node_modules/pkg/i.js'), 'bodyBackgroundColor');
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  it('finds the symbol and ignores node_modules', async () => {
    const matches = await searchWorkspace(cwd, ['bodyBackgroundColor']);
    expect(matches).toContain('pages/index.js');
    expect(matches.some((m) => m.includes('node_modules'))).toBe(false);
  });

  it('is safe when there are no matches', async () => {
    expect(await searchWorkspace(cwd, ['zzzNeverFound'])).toEqual([]);
  });
});

describe('runErrorFix', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'efr2-'));
    await fs.mkdir(path.join(cwd, 'pages'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"x","scripts":{"build":"node -e 0"}}');
    await fs.writeFile(path.join(cwd, 'pages/index.js'), 'export default function H(){const c=theme.bodyBackgroundColor;return <div style={{background:c}}/>}');
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  it('searches symbol, reads file, applies fix plan after approval', async () => {
    const error = detectErrorPaste("Cannot read properties of undefined (reading 'bodyBackgroundColor')");
    expect(error.isError).toBe(true);
    if (!error.isError) return;
    const plan = JSON.stringify({
      commands: [],
      files: [{content: 'export default function H(){const theme={bodyBackgroundColor:"#000"};return <div style={{background:theme.bodyBackgroundColor}}/>}', operation: 'overwrite', path: 'pages/index.js'}],
      summary: 'Define theme before use',
      validation: ['npm run build'],
    });
    const result = await runErrorFix({
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: createMockConfig(),
      cwd,
      error,
      eventBus: new EventBus(),
      model: 'fake',
      prompt: "Cannot read properties of undefined (reading 'bodyBackgroundColor')",
      provider: fakeProvider(plan),
      session: createSession(cwd, 'p', 'm'),
      sessionStore: stubSessionStore,
      taskState: taskState(),
      toolRegistry: createDefaultToolRegistry(),
      transcriptPath: path.join(cwd, 't.jsonl'),
    });
    expect(result.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(result.toolCalls.some((c) => c.toolName === 'command_output')).toBe(false);
    expect(result.toolCalls.every((c) => c.toolName !== 'run_command' || typeof c.input.command === 'string')).toBe(true);
    expect(result.finalMessage.content).toMatch(/Fixed pages\/index\.js/);
    await fs.readFile(path.join(cwd, 'pages/index.js'), 'utf8').then((c) => {
      expect(c).toContain('bodyBackgroundColor:"#000"');
    });
  });

  it('runs npm run build to validate even for undefined-property errors', async () => {
    // Previously gated behind error.shouldRunBuild, so an undefined-property
    // paste would never validate. The fix must always validate when a build
    // script exists, so silent breakage cannot pass.
    const error = detectErrorPaste("Cannot read properties of undefined (reading 'bodyBackgroundColor')");
    if (!error.isError) return;
    const plan = JSON.stringify({
      commands: [],
      files: [{content: 'export default function H(){return null}', operation: 'overwrite', path: 'pages/index.js'}],
      summary: 'stub',
      validation: [],
    });
    const result = await runErrorFix({
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: createMockConfig(),
      cwd,
      error,
      eventBus: new EventBus(),
      model: 'fake',
      prompt: 'err',
      provider: fakeProvider(plan),
      session: createSession(cwd, 'p', 'm'),
      sessionStore: stubSessionStore,
      taskState: taskState(),
      toolRegistry: createDefaultToolRegistry(),
      transcriptPath: path.join(cwd, 't.jsonl'),
    });
    const buildCalls = result.toolCalls.filter(
      (c) => c.toolName === 'run_command' && typeof c.input.command === 'string' && c.input.command.includes('build'),
    );
    expect(buildCalls.length).toBeGreaterThan(0);
    expect(result.finalMessage.content).toMatch(/Validation:/);
  });

  it('denied approval changes nothing and reports cleanly', async () => {
    const error = detectErrorPaste("TypeError: Cannot read properties of undefined (reading 'bodyBackgroundColor')");
    if (!error.isError) return;
    const plan = JSON.stringify({commands: [], files: [{content: 'fixed', operation: 'overwrite', path: 'pages/index.js'}], summary: 's', validation: []});
    const result = await runErrorFix({
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: false})),
      config: createMockConfig(),
      cwd,
      error,
      eventBus: new EventBus(),
      model: 'fake',
      prompt: 'err',
      provider: fakeProvider(plan),
      session: createSession(cwd, 'p', 'm'),
      sessionStore: stubSessionStore,
      taskState: taskState(),
      toolRegistry: createDefaultToolRegistry(),
      transcriptPath: path.join(cwd, 't.jsonl'),
    });
    expect(result.taskState?.filesChanged ?? []).toEqual([]);
    const content = await fs.readFile(path.join(cwd, 'pages/index.js'), 'utf8');
    expect(content).toContain('theme.bodyBackgroundColor');
  });
});
