import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness, toolChunks} from './harness.js';

describe('agent basic E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('streams a single-turn answer without tools', async () => {
    harness = await new E2EHarness({scripts: ['Hello from native streaming.']}).setup();
    const run = await harness.run('Say hello', {mode: 'chat'});

    expect(run.result.finalMessage.content).toContain('Hello from native streaming');
    expect(run.toolCalls).toHaveLength(0);
    expect(run.events.filter((event) => event.type === 'message.delta').map((event) => 'delta' in event ? event.delta : '')).toContain('Hello from native streaming.');
    expect(run.events.some((event) => event.type === 'message.completed')).toBe(true);
  });

  it('executes a native readFile tool call through ToolRegistry', async () => {
    // Phase 17E: a bare "Read README.md" now short-circuits through the
    // simple-action runtime, bypassing the generic loop entirely. To
    // exercise the model-driven loop dispatch we use a prompt that
    // requires reasoning (so simpleActionRouter returns null) but still
    // makes the model call read_file.
    harness = await new E2EHarness({
      fixtures: {'README.md': 'project notes\n'},
      scripts: [toolChunks('read_file', {path: 'README.md'}), 'I read the notes.'],
    }).setup();
    const run = await harness.run('What does README.md contain?', {mode: 'explain'});

    expect(run.toolCalls.map((toolCall) => toolCall.toolName)).toContain('read_file');
    expect(run.toolCalls[0]?.result?.output).toContain('project notes');
    expect(run.result.finalMessage.content).toContain('I read the notes');
  });

  it('emits streaming lifecycle events in order', async () => {
    harness = await new E2EHarness({scripts: ['streamed answer']}).setup();
    const run = await harness.run('Stream once');
    const eventTypes = run.events.map((event) => event.type);
    const lastDelta = eventTypes.lastIndexOf('message.delta');
    const lastCompleted = eventTypes.lastIndexOf('message.completed');

    expect(eventTypes.indexOf('message.started')).toBeLessThan(lastDelta);
    expect(lastDelta).toBeLessThan(lastCompleted);
    expect(eventTypes).toContain('session.saved');
  });

  it('uses provider.stream and never relies on provider.chat', async () => {
    harness = await new E2EHarness({scripts: ['Native path only.']}).setup();
    const provider = harness.provider as typeof harness.provider & {chat?: unknown};
    await harness.run('Use native streaming');

    expect(provider.calls).toHaveLength(1);
    expect(provider.chat).toBeUndefined();
  });

  it('reports malformed tool JSON without crashing the loop', async () => {
    harness = await new E2EHarness({
      scripts: [[
        {toolName: 'read_file', toolUseId: 'bad-json', type: 'tool_use_start'},
        {toolInputDelta: '{"path":', toolUseId: 'bad-json', type: 'tool_use_delta'},
        {toolUseId: 'bad-json', type: 'tool_use_end'},
      ], 'Recovered after tool format error.'],
    }).setup();
    const run = await harness.run('Read with malformed input');

    expect(run.toolCalls.some((toolCall) => toolCall.status === 'error')).toBe(true);
    expect(run.messages.some((message) => message.role === 'tool' && message.content.includes('invalid JSON'))).toBe(true);
    expect(run.result.finalMessage.content).toContain('Recovered');
  });
});
