import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness, toolChunks} from './harness.js';
import {compressToolOutput} from '../../src/tools/outputCompressor.js';
import {normalizeToolResult} from '../../src/tools/resultContract.js';

describe('Native Tool Calling 2.0 E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('mock provider tool call executes and result lands in messages', async () => {
    // Phase 17E: "Read a.txt" now routes through the simple-action runtime,
    // so we use a prompt that the loop owns end-to-end while still asking
    // the scripted provider to invoke read_file on a.txt.
    harness = await new E2EHarness({
      fixtures: {'a.txt': 'hello world\n'},
      scripts: [
        toolChunks('read_file', {path: 'a.txt'}),
        'Read the file successfully.',
      ],
    }).setup();

    const run = await harness.run('What does a.txt say?', {mode: 'chat'});
    expect(run.toolCalls.map((c) => c.toolName)).toContain('read_file');
    expect(run.messages.some((m) => m.role === 'tool' && m.content.includes('hello world'))).toBe(true);
  });

  it('malformed tool input still gets parsed when repairable (trailing comma)', async () => {
    harness = await new E2EHarness({
      fixtures: {'b.txt': 'data\n'},
      scripts: [
        // Inject trailing comma — repair layer should fix it
        [
          {toolName: 'read_file', toolUseId: 'tu1', type: 'tool_use_start'},
          {toolInputDelta: '{"path":"b.txt",}', toolUseId: 'tu1', type: 'tool_use_delta'},
          {toolUseId: 'tu1', type: 'tool_use_end'},
          {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}},
        ],
        'Done.',
      ],
    }).setup();

    const run = await harness.run('Read with malformed input', {mode: 'chat'});
    const readCall = run.toolCalls.find((c) => c.toolName === 'read_file');
    expect(readCall).toBeDefined();
    expect(readCall?.status).toBe('success');
  });

  it('large tool output gets compressed for the model contract', () => {
    const big = Array.from({length: 500}, (_, i) => `line ${i} of much output content here`).join('\n');
    const compressed = compressToolOutput('run_command', big, {
      maxTokens: 50,
      preserveErrors: true,
      preserveStackTraces: true,
      preserveFailingTests: true,
    });
    expect(compressed.compressionRatio).toBeLessThanOrEqual(1);
    expect(compressed.content.length).toBeLessThan(big.length);
  });

  it('result contract normalizes ok/severity/truncated for downstream', () => {
    const norm = normalizeToolResult('test_runner', {ok: false, summary: 'fail', output: 'FAIL test1'});
    expect(norm.severity).toBe('error');
    expect(norm.ok).toBe(false);
  });

  it('does not emit XML directives in output (native path)', async () => {
    harness = await new E2EHarness({
      fixtures: {'c.txt': 'ok\n'},
      scripts: [toolChunks('read_file', {path: 'c.txt'}), 'All good.'],
    }).setup();

    const run = await harness.run('Native tool call only', {mode: 'chat'});
    const allText = run.messages.map((m) => m.content).join('\n');
    expect(allText).not.toMatch(/<tool_use[\s>]/u);
    expect(allText).not.toMatch(/<\/tool_use>/u);
  });

  it('orchestrator runs two read-only tools in parallel and emits parallel-group events', async () => {
    harness = await new E2EHarness({
      fixtures: {'p.txt': 'p\n', 'q.txt': 'q\n'},
      scripts: [
        [
          ...toolChunks('read_file', {path: 'p.txt'}, 'tu_p'),
          ...toolChunks('read_file', {path: 'q.txt'}, 'tu_q'),
          {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}},
        ],
        'Both done.',
      ],
    }).setup();

    const run = await harness.run('Read both', {mode: 'chat'});
    expect(run.toolCalls).toHaveLength(2);
    expect(run.toolCalls.every((c) => c.status === 'success')).toBe(true);
    const startedEvents = run.events.filter((e) => e.type === 'tool_call.parallel_group_started');
    const completedEvents = run.events.filter((e) => e.type === 'tool_call.parallel_group_completed');
    expect(startedEvents.length).toBeGreaterThanOrEqual(1);
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('emits tool_result.normalized after each tool result', async () => {
    // Phase 17E: same rerouting concern as the first test in this suite —
    // use a reasoning-style prompt so the loop owns the dispatch.
    harness = await new E2EHarness({
      fixtures: {'r.txt': 'data\n'},
      scripts: [toolChunks('read_file', {path: 'r.txt'}), 'Done.'],
    }).setup();
    const run = await harness.run('What does r.txt contain?', {mode: 'chat'});
    const norm = run.events.filter((e) => e.type === 'tool_result.normalized');
    expect(norm.length).toBeGreaterThanOrEqual(1);
  });
});
