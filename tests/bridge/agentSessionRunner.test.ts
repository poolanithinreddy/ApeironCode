/**
 * Tests for BridgeAgentSessionRunner.
 */

import {describe, it, expect, vi} from 'vitest';
import {BridgeAgentSessionRunner, createPlaceholderRunner} from '../../src/bridge/agentSessionRunner.js';
import type {BridgeMessage} from '../../src/bridge/types.js';
import type {AgentRunResult} from '../../src/bridge/agentSessionRunner.js';

const collectEvents = async (
  runner: BridgeAgentSessionRunner,
  prompt: string,
  cwd = '/tmp',
  sessionId?: string,
): Promise<BridgeMessage[]> => {
  const events: BridgeMessage[] = [];
  const push = (msg: BridgeMessage) => { events.push(msg); return Promise.resolve(); };
  await runner.runPrompt({prompt, cwd, sessionId}, push);
  return events;
};

describe('BridgeAgentSessionRunner', () => {
  it('creates a session', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const s = runner.createSession('/tmp');
    expect(s.bridgeSessionId).toBeTruthy();
    expect(s.status).toBe('idle');
    expect(s.promptCount).toBe(0);
  });

  it('getOrCreateSession returns existing session', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const s1 = runner.createSession('/tmp');
    const s2 = runner.getOrCreateSession(s1.bridgeSessionId, '/tmp');
    expect(s2.bridgeSessionId).toBe(s1.bridgeSessionId);
  });

  it('getOrCreateSession creates new when id not found', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const s = runner.getOrCreateSession('nonexistent', '/tmp');
    expect(s.bridgeSessionId).toBeTruthy();
  });

  it('runPrompt calls injected runner', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockRunner = vi.fn(async (): Promise<AgentRunResult> => ({status: 'completed', finalMessage: 'done'}));
    const runner = new BridgeAgentSessionRunner(mockRunner);
    await collectEvents(runner, 'hello world');
    expect(mockRunner).toHaveBeenCalledOnce();
    const calls = mockRunner.mock.calls as unknown as Array<[string, string, unknown]>;
    expect(calls[0]?.[0]).toBe('hello world');
  });

  it('emits session.created and agent.started', async () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const events = await collectEvents(runner, 'hi');
    const types = events.map((e) => e.type);
    expect(types).toContain('session.created');
    expect(types).toContain('agent.started');
  });

  it('emits agent.completed and session.completed on success', async () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const events = await collectEvents(runner, 'hi');
    const types = events.map((e) => e.type);
    expect(types).toContain('agent.completed');
    expect(types).toContain('session.completed');
  });

  it('emits agent.failed on runner failure', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const failingRunner = async (): Promise<AgentRunResult> => ({
      status: 'failed',
      error: 'something broke',
    });
    const runner = new BridgeAgentSessionRunner(failingRunner);
    const events = await collectEvents(runner, 'hi');
    const types = events.map((e) => e.type);
    expect(types).toContain('agent.failed');
  });

  it('emits bridge.error when runner throws', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const throwingRunner = async (): Promise<AgentRunResult> => {
      throw new Error('boom');
    };
    const runner = new BridgeAgentSessionRunner(throwingRunner);
    const events = await collectEvents(runner, 'hi');
    const types = events.map((e) => e.type);
    expect(types).toContain('agent.failed');
    expect(types).toContain('bridge.error');
  });

  it('no raw secrets in events', async () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const events = await collectEvents(runner, 'use API_KEY=sk-superSecret');
    const text = JSON.stringify(events);
    // Redaction should have removed the secret
    expect(text).not.toContain('sk-superSecret');
  });

  it('stopSession marks session stopped', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const s = runner.createSession('/tmp');
    const result = runner.stopSession(s.bridgeSessionId);
    expect(result).toBe(true);
    expect(runner.getSession(s.bridgeSessionId)?.status).toBe('stopped');
  });

  it('stopSession returns false for unknown session', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const result = runner.stopSession('not-a-session');
    expect(result).toBe(false);
  });

  it('getSessionState returns safe state', () => {
    const runner = new BridgeAgentSessionRunner(createPlaceholderRunner());
    const s = runner.createSession('/tmp');
    const state = runner.getSessionState(s.bridgeSessionId);
    expect(state).not.toBeNull();
    expect(state?.sessionId).toBe(s.bridgeSessionId);
    expect(state?.status).toBe('idle');
  });

  it('selected context is included in prompt via buildPromptWithContext', async () => {
    let capturedPrompt = '';
    const runner = new BridgeAgentSessionRunner(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (prompt) => { capturedPrompt = prompt; return {status: 'completed'}; },
    );
    await runner.runPrompt({
      prompt: 'explain this',
      cwd: '/tmp',
      selectedContext: {filePath: '/src/foo.ts', selectedText: 'const x = 1;'},
    }, async () => {});
    expect(capturedPrompt).toContain('explain this');
    expect(capturedPrompt).toContain('[Context:');
  });

  it('rejects concurrent prompt on same session', async () => {
    const slowRunner = async (): Promise<AgentRunResult> => {
      await new Promise((r) => setTimeout(r, 50));
      return {status: 'completed'};
    };
    const runner = new BridgeAgentSessionRunner(slowRunner);
    const s = runner.createSession('/tmp');

    const events1: BridgeMessage[] = [];
    const events2: BridgeMessage[] = [];

    const push1 = (m: BridgeMessage) => { events1.push(m); return Promise.resolve(); };
    const push2 = (m: BridgeMessage) => { events2.push(m); return Promise.resolve(); };

    // Start first run (don't await)
    const p1 = runner.runPrompt({prompt: 'first', cwd: '/tmp', sessionId: s.bridgeSessionId}, push1);
    // Immediately send second
    await runner.runPrompt({prompt: 'second', cwd: '/tmp', sessionId: s.bridgeSessionId}, push2);

    await p1;

    const types2 = events2.map((e) => e.type);
    expect(types2).toContain('bridge.error');
    const errEvent = events2.find((e) => e.type === 'bridge.error');
    const errCode = typeof errEvent?.payload['code'] === 'string' ? errEvent.payload['code'] : '';
    expect(errCode).toBe('SESSION_BUSY');
  });
});
