import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {detectAppActionRequest, runRunApp} from '../../src/agent/runAppRuntime.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {createSession} from '../../src/agent/session.js';
import {createMockConfig} from '../support/mocks.js';
import {EventBus} from '../../src/core/events/bus.js';

const stubSessionStore = {save: () => Promise.resolve()} as never;
const taskState = () =>
  ({commandsRun: [], errors: [], filesChanged: [], filesRead: [], testsRun: [], todos: []}) as never;

const makeRegistry = (calls: string[]) =>
  ({
    invoke: (name: string, input: Record<string, unknown>) => {
      calls.push(`${name}:${String(input.command)}`);
      return Promise.resolve({ok: true, output: 'started', summary: 'ran'});
    },
  }) as never;

describe('runRunApp', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rra-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const base = (approve: boolean, calls: string[]) => ({
    approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: approve})),
    config: createMockConfig(),
    cwd,
    eventBus: new EventBus(),
    prompt: 'run this todo app by first cd todo and then run',
    session: createSession(cwd, 'p', 'm'),
    sessionStore: stubSessionStore,
    taskState: taskState(),
    toolRegistry: makeRegistry(calls),
    transcriptPath: path.join(cwd, 't.jsonl'),
  });

  it('fuzzy-matches todo→todo-list, reads package.json, proposes + runs on approval', async () => {
    await fs.mkdir(path.join(cwd, 'todo-list/pages'), {recursive: true});
    await fs.mkdir(path.join(cwd, 'todo-list/styles'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{"dev":"next dev"}}');
    const calls: string[] = [];
    const result = await runRunApp(base(true, calls));
    expect(result.finalMessage.content).toContain('cd todo-list && npm run dev');
    expect(calls).toEqual(['run_command:cd todo-list && npm run dev']);
    expect(result.finalMessage.content).toMatch(/existing\/partial framework app/u);
  });

  it('denied approval does not run the command', async () => {
    await fs.mkdir(path.join(cwd, 'todo-list'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{"dev":"next dev"}}');
    const calls: string[] = [];
    const result = await runRunApp(base(false, calls));
    expect(calls).toEqual([]);
    expect(result.finalMessage.content).toMatch(/approval was denied/u);
  });

  it('static app suggests open index.html', async () => {
    await fs.writeFile(path.join(cwd, 'index.html'), '<h1>x</h1>');
    const calls: string[] = [];
    const result = await runRunApp(base(true, calls));
    expect(result.finalMessage.content).toContain('open index.html');
    expect(calls).toEqual([]);
  });
});

describe('detectAppActionRequest', () => {
  it('maps run/build/fix prompts deterministically', () => {
    expect(detectAppActionRequest('run this todo app and then run')).toBe('run');
    expect(detectAppActionRequest('run the application and fix any errors and all')).toBe('build-fix');
    expect(detectAppActionRequest('build the app')).toBe('build-fix');
    expect(detectAppActionRequest('npm run build')).toBe('build-fix');
  });
  it('does not hijack fresh scaffolds or pure UI modifies', () => {
    expect(detectAppActionRequest('create a new todo application with next js')).toBeNull();
    expect(detectAppActionRequest('make the UI premium and fix errors')).toBeNull();
    expect(detectAppActionRequest('hi')).toBeNull();
  });
});

describe('runRunApp build-fix', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rbf-'));
    await fs.mkdir(path.join(cwd, 'todo-list'), {recursive: true});
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const buildBase = (ok: boolean, calls: string[]) =>
    ({
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: createMockConfig(),
      cwd,
      eventBus: new EventBus(),
      mode: 'build-fix' as const,
      prompt: 'run the application and fix any errors',
      session: createSession(cwd, 'p', 'm'),
      sessionStore: stubSessionStore,
      taskState: taskState(),
      toolRegistry: {
        invoke: (name: string, input: Record<string, unknown>) => {
          calls.push(`${name}:${String(input.command)}`);
          return Promise.resolve({ok, output: ok ? 'compiled' : 'Type error in index.js', summary: ok ? 'ok' : 'build failed'});
        },
      } as never,
      transcriptPath: path.join(cwd, 't.jsonl'),
    });

  it('build pass reports success and a run command, never claims false success', async () => {
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{"build":"next build","dev":"next dev"}}');
    const calls: string[] = [];
    const r = await runRunApp(buildBase(true, calls));
    expect(calls).toEqual(['run_command:cd todo-list && npm run build']);
    expect(r.finalMessage.content).toMatch(/Build passed/);
    expect(r.finalMessage.content).toContain('cd todo-list && npm run dev');
  });

  it('build fail without provider does not claim success and never sends empty command', async () => {
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{"build":"next build"}}');
    const calls: string[] = [];
    const r = await runRunApp(buildBase(false, calls));
    expect(r.finalMessage.content).toMatch(/Build still failing|did not claim success/);
    expect(calls.every((c) => c.startsWith('run_command:cd todo-list && npm run build'))).toBe(true);
    expect(calls.some((c) => c === 'run_command:undefined')).toBe(false);
  });

  it('no build script explains instead of running empty command', async () => {
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{}}');
    const calls: string[] = [];
    const r = await runRunApp(buildBase(true, calls));
    expect(calls).toEqual([]);
    expect(r.finalMessage.content).toMatch(/No `build` script/);
  });
});
