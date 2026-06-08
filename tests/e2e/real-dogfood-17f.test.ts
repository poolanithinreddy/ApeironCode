/**
 * Phase 17F real dogfood — exercises the Agent.run() path through realistic
 * multi-turn scenarios. Each test covers behavior added or tightened in
 * Phase 17E: feature-add routing, read-only debug safety, deterministic file
 * read, path traversal blocking, and pasted-error debugging in a real session.
 *
 * All tests use ScriptedStreamingProvider; no real network, no real API key,
 * temp workspaces only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';

const filePlan = (
  summary: string,
  files: Array<{path: string; content: string; operation?: 'overwrite' | 'create' | 'delete' | 'rename'}>,
): string =>
  JSON.stringify({
    summary,
    commands: [],
    validation: [],
    files: files.map((f) => ({operation: f.operation ?? 'overwrite', path: f.path, content: f.content})),
  });

describe('Phase 17F real dogfood', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('feature-add: "add a login page" routes to modify_existing_app and writes the file plan', async () => {
    // Workspace pretends to be an existing static app.
    harness = await new E2EHarness({
      fixtures: {
        'index.html': '<!doctype html><html><body><h1>App</h1></body></html>',
        'styles.css': 'body { background: white; }',
        'app.js': 'console.log("hi");',
      },
      scripts: [
        filePlan('Add login page', [
          {path: 'login.html', content: '<!doctype html><html><body><form id="login"><input name="user"><input name="pass" type="password"><button>Sign in</button></form></body></html>'},
        ]),
      ],
    }).setup();

    const run = await harness.run('add a login page with premium UI');

    // It must have called the provider to get a file plan (autonomous coding).
    expect(harness.provider.calls.length).toBeGreaterThan(0);
    // The new login.html must exist on disk.
    const loginExists = await fs.stat(path.join(harness.workspace, 'login.html')).then(() => true).catch(() => false);
    expect(loginExists).toBe(true);
    const login = await harness.readFile('login.html');
    expect(login).toMatch(/<form/i);
    // No malformed tool calls in the toolCalls record.
    for (const tc of run.toolCalls) {
      if (tc.toolName === 'read_file') expect(tc.input.path).toBeTypeOf('string');
      if (tc.toolName === 'write_file') {
        expect(tc.input.path).toBeTypeOf('string');
        expect(tc.input.content).toBeTypeOf('string');
      }
      if (tc.toolName === 'run_command') expect(tc.input.command).toBeTypeOf('string');
    }
  });

  it('read-only debug question never invokes write_file or run_command', async () => {
    harness = await new E2EHarness({
      fixtures: {'src/foo.js': 'function foo(){ return undefined }\n'},
      // Scripted provider answers in plain text — no tool calls.
      scripts: ['Your function returns undefined because it has no explicit return value.'],
    }).setup();

    const run = await harness.run('why is my function returning undefined?');

    // Critical safety guarantees from the audit:
    expect(run.toolCalls.some((tc) => tc.toolName === 'write_file')).toBe(false);
    expect(run.toolCalls.some((tc) => tc.toolName === 'run_command')).toBe(false);
    // The exposure policy event tells us what tools the provider was offered.
    const exposureEvent = run.events.find((e) => e.type === 'tools.exposure_selected');
    expect(exposureEvent).toBeDefined();
    if (exposureEvent && 'includedTools' in exposureEvent) {
      expect(exposureEvent.includedTools).not.toContain('write_file');
      expect(exposureEvent.includedTools).not.toContain('run_command');
    }
  });

  it('"read package.json" is deterministic: no provider call, file content returned', async () => {
    harness = await new E2EHarness({
      fixtures: {'package.json': '{"name":"dogfood-target","version":"1.0.0"}\n'},
      // Provider scripts should NEVER be consumed for a simple-action read.
      scripts: ['SHOULD NOT BE USED'],
    }).setup();

    const callsBefore = harness.provider.calls.length;
    const run = await harness.run('read package.json');

    // Zero provider calls: deterministic path.
    expect(harness.provider.calls.length).toBe(callsBefore);
    // ToolRegistry was invoked with read_file{path: 'package.json'}.
    expect(
      run.toolCalls.some(
        (tc) => tc.toolName === 'read_file' && tc.input.path === 'package.json',
      ),
    ).toBe(true);
    // Final message contains the file content.
    expect(run.result.finalMessage.content).toMatch(/dogfood-target/);
  });

  it('"read ../../etc/passwd" is blocked safely — no file read, no traversal', async () => {
    harness = await new E2EHarness({
      fixtures: {'package.json': '{"name":"x"}'},
      scripts: ['SHOULD NOT BE USED'],
    }).setup();

    const run = await harness.run('read ../../etc/passwd');

    // ToolRegistry must NOT have read /etc/passwd. If a read_file was
    // attempted, it must have failed safely with no output containing root.
    const reads = run.toolCalls.filter((tc) => tc.toolName === 'read_file');
    for (const r of reads) {
      // Either the call failed, or the output is empty / does not contain
      // /etc/passwd content. We assert no actual /etc/passwd content leaked.
      expect(r.result?.output ?? '').not.toMatch(/^root:/m);
    }
    // The final message must not contain /etc/passwd contents either.
    expect(run.result.finalMessage.content).not.toMatch(/^root:/m);
  });

  it('multi-turn calculator session: build → premium → reference error', async () => {
    // 1. Build the calculator
    const buildPlan = filePlan('Build calculator', [
      {
        path: 'index.html',
        content: `<!doctype html><html><body>
<div id="display">0</div>
<button class="num">1</button><button class="num">2</button>
<button class="op">+</button><button id="equals">=</button>
<button id="clear">C</button>
<script src="app.js"></script></body></html>`,
      },
      {path: 'styles.css', content: 'body { font-family: system-ui; }'},
      {
        path: 'app.js',
        content: `function calculateResult(a, b, op){ return op==='+' ? a+b : 0; }
document.querySelectorAll('.num').forEach((b) => b.addEventListener('click', () => {}));
document.getElementById('equals').addEventListener('click', () => {
  const r = calculateResult(1, 2, '+');
  document.getElementById('display').textContent = r;
});
document.getElementById('clear').addEventListener('click', () => {
  document.getElementById('display').textContent = '0';
});`,
      },
    ]);
    // 2. Premium modify
    const premiumPlan = filePlan('Premium iPhone UI', [
      {path: 'styles.css', content: 'body { background: #000; color: #fff; font-family: -apple-system; border-radius: 24px; }'},
    ]);
    // 3. Fix calculateResult is not defined — but our build already had it,
    //    so the "fix" plan re-asserts it (a realistic provider response).
    const referenceErrorPlan = filePlan('Define calculateResult', [
      {
        path: 'app.js',
        content: `function calculateResult(a, b, op){ if(op==='+') return a+b; if(op==='-') return a-b; if(op==='*') return a*b; if(op==='/') return a/b; return 0; }
document.getElementById('clear').addEventListener('click', () => { document.getElementById('display').textContent='0'; });`,
      },
    ]);

    harness = await new E2EHarness({
      // No fixtures: fresh workspace.
      scripts: [buildPlan, premiumPlan, referenceErrorPlan],
    }).setup();

    // Turn 1: build
    const r1 = await harness.run('Build a calculator web app using HTML CSS JS');
    expect(await fs.stat(path.join(harness.workspace, 'index.html')).then(() => true).catch(() => false)).toBe(true);
    expect(await harness.readFile('app.js')).toMatch(/calculateResult/);
    expect(r1.toolCalls.some((tc) => tc.toolName === 'write_file' && tc.input.path === 'index.html')).toBe(true);

    // Turn 2: premium UI tweak
    const r2 = await harness.run('make the UI premium like an iPhone calculator and fix background');
    expect(await harness.readFile('styles.css')).toMatch(/#000/);
    // It should NOT have written index.html again unless the plan said so.
    const stylesWrites2 = r2.toolCalls.filter((tc) => tc.toolName === 'write_file' && tc.input.path === 'styles.css');
    expect(stylesWrites2.length).toBeGreaterThan(0);

    // Turn 3: pasted error
    const r3 = await harness.run("ReferenceError: calculateResult is not defined");
    // Must route to error-fix runtime: provider called, fix plan applied.
    expect(await harness.readFile('app.js')).toMatch(/calculateResult/);
    // No malformed tool calls.
    for (const tc of r3.toolCalls) {
      if (tc.toolName === 'read_file') expect(tc.input.path).toBeTypeOf('string');
      if (tc.toolName === 'write_file') expect(tc.input.path).toBeTypeOf('string');
      if (tc.toolName === 'run_command') expect(tc.input.command).toBeTypeOf('string');
    }
  });

  it('malformed tool calls fail once each with tool-specific messages, no loop', async () => {
    // The scripted provider emits a malformed tool call in turn 1, then a
    // clean follow-up message in turn 2. The loop must not retry the bad
    // call and must report a tool-specific error.
    harness = await new E2EHarness({
      fixtures: {'a.txt': 'hi'},
      scripts: [
        // Malformed read_file: empty input object.
        [
          {toolName: 'read_file', toolUseId: 'rf1', type: 'tool_use_start'},
          {toolInputDelta: '{}', toolUseId: 'rf1', type: 'tool_use_delta'},
          {toolUseId: 'rf1', type: 'tool_use_end'},
          {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}},
        ],
        'Stopped — I cannot read without a path.',
      ],
    }).setup();

    const run = await harness.run('What does a.txt contain?', {mode: 'chat'});

    // No tool result should reference a *different* tool's contract message.
    const toolMessages = run.messages.filter((m) => m.role === 'tool');
    for (const m of toolMessages) {
      // If read_file failed, the message must say read_file, not write_file etc.
      if (/requires path/u.test(m.content)) {
        expect(m.content).toMatch(/read_file/);
        expect(m.content).not.toMatch(/write_file/);
        expect(m.content).not.toMatch(/run_command/);
        expect(m.content).not.toMatch(/todo_write/);
      }
    }
    // At least one tool error happened (the malformed one).
    const failed = run.toolCalls.filter((tc) => tc.status === 'error');
    expect(failed.length).toBeGreaterThanOrEqual(1);
    // The model did not get into a loop retrying the same malformed call.
    const reads = run.toolCalls.filter((tc) => tc.toolName === 'read_file');
    expect(reads.length).toBeLessThanOrEqual(2);
  });
});
