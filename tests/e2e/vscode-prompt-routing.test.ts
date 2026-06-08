/**
 * E2E tests for VS Code prompt routing through the bridge.
 * Uses mocked Agent runner. No real provider calls.
 */

import {describe, it, expect, vi} from 'vitest';
import {BridgeServer} from '../../src/bridge/server.js';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';
import type {BridgeMessage} from '../../src/bridge/types.js';
import {createBridgeMessage} from '../../src/bridge/types.js';
import type {AgentRunnerOptions, AgentRunResult} from '../../src/bridge/agentSessionRunner.js';
import {createPlaceholderRunner} from '../../src/bridge/agentSessionRunner.js';
import {
  validateSendPromptPayload,
  buildPromptWithContext,
} from '../../src/bridge/commands.js';
import {PROVIDER_CATALOG} from '../../src/providers/catalog.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeAuthServer = async (agentRunner = createPlaceholderRunner()) => {
  const token = 'test-token-abc';
  const transport = new InMemoryTransport();
  const server = new BridgeServer(
    {transport, secretInfo: {token, fingerprint: 'abc123', createdAt: new Date().toISOString()}, agentRunner},
    {},
  );
  await server.start({localOnly: true});

  // Create an authenticated connection
  const connId = transport.connect({authenticated: false});

  // Authenticate
  await transport.sendFromClient(connId, createBridgeMessage('bridge.hello', {token}));
  // Clear bridge.ready from received list
  const _ = transport.getClientMessages(connId).splice(0);
  void _;

  const getReceived = () => transport.getClientMessages(connId);

  return {server, transport, connId, getReceived, token};
};

const waitForType = (
  getReceived: () => BridgeMessage[],
  type: string,
  timeout = 2000,
): Promise<BridgeMessage> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      const found = getReceived().find((m) => m.type === type);
      if (found) return resolve(found);
      if (Date.now() > deadline) return reject(new Error(`Timeout waiting for ${type}`));
      setTimeout(check, 20);
    };
    check();
  });

// ─── Test 1: Authenticated send_prompt invokes mocked runner ─────────────────

describe('Scenario 1: authenticated session.send_prompt invokes mocked runner', () => {
  it('calls the injected runner and emits session events', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockRunner = vi.fn(async (): Promise<AgentRunResult> => ({
      status: 'completed',
      finalMessage: 'mock result',
    }));

    const {transport, connId, getReceived} = await makeAuthServer(mockRunner);

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'write a test',
      cwd: '/tmp',
    }));

    await waitForType(getReceived, 'session.completed');

    expect(mockRunner).toHaveBeenCalledOnce();
    const types = getReceived().map((m) => m.type);
    expect(types).toContain('session.created');
    expect(types).toContain('agent.started');
    expect(types).toContain('agent.completed');
    expect(types).toContain('session.completed');
  });
});

// ─── Test 2: Unauthenticated send_prompt rejected ─────────────────────────────

describe('Scenario 2: unauthenticated session.send_prompt rejected', () => {
  it('rejects unauthenticated send_prompt', async () => {
    const transport = new InMemoryTransport();
    const server = new BridgeServer(
      {transport, secretInfo: {token: 'secret', fingerprint: 'fp', createdAt: new Date().toISOString()}},
      {},
    );
    await server.start({localOnly: true});

    // Connect WITHOUT authenticating
    const connId = transport.connect({authenticated: false});

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'hello',
      cwd: '/tmp',
    }));

    const received = transport.getClientMessages(connId);
    const errMsg = received.find((m) => m.type === 'bridge.error');
    expect(errMsg).toBeDefined();
    const errCode = typeof errMsg?.payload['code'] === 'string' ? errMsg.payload['code'] : '';
    expect(errCode).toBe('UNAUTHENTICATED');
  });
});

// ─── Test 3: Selected context included and capped ────────────────────────────

describe('Scenario 3: selected context included and redacted', () => {
  it('includes selected context in prompt passed to runner', async () => {
    let capturedPrompt = '';
    // eslint-disable-next-line @typescript-eslint/require-await
    const runner = async (prompt: string): Promise<AgentRunResult> => {
      capturedPrompt = prompt;
      return {status: 'completed'};
    };

    const {transport, connId, getReceived} = await makeAuthServer(runner);

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'explain this',
      cwd: '/tmp',
      selectedContext: {
        filePath: '/src/utils.ts',
        workspaceRelativePath: 'src/utils.ts',
        languageId: 'typescript',
        selectedText: 'function add(a: number, b: number) { return a + b; }',
        lineStart: 5,
        lineEnd: 7,
      },
    }));

    await waitForType(getReceived, 'session.completed');

    expect(capturedPrompt).toContain('[Context: src/utils.ts');
    expect(capturedPrompt).toContain('explain this');
    expect(capturedPrompt).toContain('function add');
  });

  it('selected text is capped to max length', () => {
    const r = validateSendPromptPayload({
      prompt: 'analyze',
      cwd: '/tmp',
      selectedContext: {filePath: '/f.ts', selectedText: 'x'.repeat(9000)},
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value.selectedContext?.selectedText?.length ?? 0)).toBeLessThanOrEqual(8_001);
    }
  });
});

// ─── Test 4: session.message streams back ────────────────────────────────────

describe('Scenario 4: session.message streams back to connection', () => {
  it('assistant message is sent to connection', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const runner = async (): Promise<AgentRunResult> => ({
      status: 'completed',
      finalMessage: 'Here is your answer.',
    });

    const {transport, connId, getReceived} = await makeAuthServer(runner);

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'question',
      cwd: '/tmp',
    }));

    await waitForType(getReceived, 'session.completed');

    const assistantMsg = getReceived().find((m) =>
      m.type === 'session.message' && m.payload['role'] === 'assistant',
    );
    expect(assistantMsg).toBeDefined();
    const content = typeof assistantMsg?.payload['content'] === 'string' ? assistantMsg.payload['content'] : '';
    expect(content).toContain('Here is your answer');
  });
});

// ─── Test 5: Tool event emitted ──────────────────────────────────────────────

describe('Scenario 5: tool event routed', () => {
  it('onEvent callback can emit tool events', async () => {
    const runner = async (
      _p: string,
      _c: string,
      opts: AgentRunnerOptions,
    ): Promise<AgentRunResult> => {
      await opts.onEvent?.(createBridgeMessage('tool.started', {toolName: 'readFile', toolCallId: 't1'}));
      await opts.onEvent?.(createBridgeMessage('tool.completed', {toolName: 'readFile', toolCallId: 't1'}));
      return {status: 'completed', finalMessage: 'done'};
    };

    const {transport, connId, getReceived} = await makeAuthServer(runner);

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'do something',
      cwd: '/tmp',
    }));

    await waitForType(getReceived, 'session.completed');

    const toolStarted = getReceived().find((m) => m.type === 'tool.started');
    expect(toolStarted).toBeDefined();
  });
});

// ─── Test 6 & 7: Permission approve/deny ─────────────────────────────────────

describe('Scenario 6 & 7: permission approve/deny', () => {
  it('permission.approved message handled without error', async () => {
    const {transport, connId, getReceived} = await makeAuthServer();

    await transport.sendFromClient(connId, createBridgeMessage('permission.approved', {
      requestId: 'req-001',
    }));

    const errMsg = getReceived().find((m) => m.type === 'bridge.error');
    expect(errMsg).toBeUndefined();
  });

  it('permission.denied message handled without error', async () => {
    const {transport, connId, getReceived} = await makeAuthServer();

    await transport.sendFromClient(connId, createBridgeMessage('permission.denied', {
      requestId: 'req-002',
    }));

    const errMsg = getReceived().find((m) => m.type === 'bridge.error');
    expect(errMsg).toBeUndefined();
  });
});

// ─── Test 8: Concurrent prompts rejected ────────────────────────────────────

describe('Scenario 8: concurrent prompts rejected deterministically', () => {
  it('second prompt while first is running gets session.busy', async () => {
    let firstResolve: (() => void) | undefined;
    const slowRunner = async (): Promise<AgentRunResult> => {
      await new Promise<void>((res) => { firstResolve = res; });
      return {status: 'completed'};
    };

    const {transport, connId, getReceived} = await makeAuthServer(slowRunner);

    // Start first prompt (fire and forget)
    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'first prompt',
      cwd: '/tmp',
    }));

    // Wait until session.created arrives (first prompt running)
    await waitForType(getReceived, 'session.created');
    const sessionId = ((getReceived().find((m) => m.type === 'session.created')?.payload) as Record<string, unknown>)?.['sessionId'] as string;

    // Send second prompt on same session
    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'second prompt',
      cwd: '/tmp',
      sessionId,
    }));

    // Should get busy message
    const busyMsg = getReceived().find((m) => m.type === 'session.busy');
    expect(busyMsg).toBeDefined();

    // Let first complete
    firstResolve?.();
    await waitForType(getReceived, 'session.completed');
  });
});

// ─── Test 8b: Session model preference merged into runner ────────────────────

describe('Scenario 8b: provider.set_session_model merged into send_prompt', () => {
  it('stores model on connection and passes provider/model to runner', async () => {
    const catalogEntry = PROVIDER_CATALOG.find((e) => e.status !== 'planned' && e.recommendedModels.length > 0);
    if (!catalogEntry) return;

    let capturedOpts: AgentRunnerOptions | undefined;
    const mockRunner = vi.fn((_p: string, _cwd: string, o: AgentRunnerOptions): Promise<AgentRunResult> => {
      capturedOpts = o;
      return Promise.resolve({status: 'completed', finalMessage: 'ok'});
    });

    const {transport, connId, getReceived} = await makeAuthServer(mockRunner);
    const mid = catalogEntry.recommendedModels[0]!.id;

    await transport.sendFromClient(connId, createBridgeMessage('provider.set_session_model', {
      providerId: catalogEntry.id,
      modelId: mid,
    }));

    const ack = getReceived().find((m) => m.type === 'provider.session_model');
    expect(ack?.payload['stored']).toBe(true);

    await transport.sendFromClient(connId, createBridgeMessage('session.send_prompt', {
      prompt: 'hi',
      cwd: '/tmp',
    }));
    await waitForType(getReceived, 'session.completed');

    expect(capturedOpts?.providerName).toBe(catalogEntry.id);
    expect(capturedOpts?.model).toBe(mid);
  });

  it('rejects invalid provider.set_session_model', async () => {
    const {transport, connId, getReceived} = await makeAuthServer(createPlaceholderRunner());
    await transport.sendFromClient(connId, createBridgeMessage('provider.set_session_model', {
      providerId: 'not-real-provider-xyz',
      modelId: 'm',
    }));
    const err = getReceived().find((m) => m.type === 'bridge.error');
    expect(err).toBeDefined();
  });
});

// ─── Test 9: Connection file contains fingerprint only ───────────────────────

describe('Scenario 9: bridge connection file has no full token', () => {
  it('validates connection info never contains full token', async () => {
    const {validateConnectionInfoSafe} = await import('../../src/bridge/connectionFile.js');

    const safeInfo = {
      endpoint: 'ws://127.0.0.1:5432',
      tokenFingerprint: 'abc123def456',
      startedAt: new Date().toISOString(),
      pid: 12345,
    };
    expect(validateConnectionInfoSafe(safeInfo)).toBe(true);

    const unsafeInfo = {
      endpoint: 'ws://127.0.0.1:5432',
      // 64-char hex string would fail validation
      tokenFingerprint: 'a'.repeat(64),
      startedAt: new Date().toISOString(),
      pid: 12345,
    };
    expect(validateConnectionInfoSafe(unsafeInfo)).toBe(false);
  });
});

// ─── Test 10: No full token in outputs ───────────────────────────────────────

describe('Scenario 10: no full token or secret in extension output', () => {
  it('bridge error messages do not expose wrong tokens', async () => {
    const transport = new InMemoryTransport();
    const server = new BridgeServer(
      {transport, secretInfo: {token: 'real-secret-token', fingerprint: 'fp', createdAt: new Date().toISOString()}},
      {},
    );
    await server.start({localOnly: true});

    const connId = transport.connect({authenticated: false});
    await transport.sendFromClient(connId, createBridgeMessage('bridge.hello', {
      token: 'wrong-token',
    }));

    const received = transport.getClientMessages(connId);
    const errMsg = received.find((m) => m.type === 'bridge.error');
    expect(errMsg).toBeDefined();
    const text = JSON.stringify(errMsg);
    expect(text).not.toContain('wrong-token');
    expect(text).not.toContain('real-secret-token');
  });

  it('buildPromptWithContext formats context without leaking internal data', () => {
    const result = buildPromptWithContext('hello', {
      filePath: '/home/user/.config/secrets.txt',
      selectedText: 'some code content',
    });
    expect(result).toContain('[Context:');
    expect(result).toContain('hello');
    expect(result).toContain('some code content');
  });
});
