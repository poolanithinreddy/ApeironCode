import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';

describe('agent multi-turn and session E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('preserves conversation context across turns', async () => {
    harness = await new E2EHarness({scripts: ['First answer.', 'Second answer.']}).setup();

    await harness.run('Remember alpha', {mode: 'chat'});
    const second = await harness.run('Continue with beta', {mode: 'chat'});

    expect(second.providerCalls.at(-1)?.messages.map((message) => message.content).join('\n')).toContain('First answer');
    expect(second.result.messages.map((message) => message.content).join('\n')).toContain('Second answer');
  });

  it('clearConversation clears visible message state', async () => {
    harness = await new E2EHarness({scripts: ['Before clear.', 'After clear.']}).setup();
    await harness.run('Before clear');

    harness.agent?.clearConversation();
    expect(harness.agent?.messages).toHaveLength(0);

    const run = await harness.run('After clear');
    expect(run.result.messages.map((message) => message.content).join('\n')).not.toContain('Before clear');
  });

  it('loadSession restores messages for continuation', async () => {
    harness = await new E2EHarness({scripts: ['Saved context.', 'Loaded context.']}).setup();
    await harness.run('Create saved context');
    const saved = structuredClone(harness.agent!.currentSession);

    harness.agent?.clearConversation();
    harness.agent?.loadSession(saved);
    const run = await harness.run('Use restored context');

    expect(run.providerCalls.at(-1)?.messages.map((message) => message.content).join('\n')).toContain('Saved context');
    expect(run.result.finalMessage.content).toContain('Loaded context');
  });

  it('accumulates usage metadata and does not duplicate completed messages', async () => {
    harness = await new E2EHarness({scripts: ['Usage one.', 'Usage two.']}).setup();
    const first = await harness.run('Turn one');
    const second = await harness.run('Turn two');

    expect(first.tokenUsage?.totalTokens).toBeGreaterThan(0);
    expect(second.tokenUsage?.totalTokens).toBeGreaterThan(0);
    const completedIds = second.events
      .filter((event) => event.type === 'message.completed')
      .map((event) => event.type === 'message.completed' ? event.message.id : '');
    expect(new Set(completedIds).size).toBe(completedIds.length);
  });
});
