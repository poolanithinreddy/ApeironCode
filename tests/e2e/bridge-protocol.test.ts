/**
 * E2E: ApeironCode IDE Bridge Protocol tests.
 * Uses in-memory transport only — no real network, no real API keys.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createBridgeSecret, loadOrCreateBridgeSecret, validateBridgeToken, fingerprintToken} from '../../src/bridge/auth.js';
import {BridgeServer} from '../../src/bridge/server.js';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';
import {createBridgeMessage} from '../../src/bridge/types.js';
import {redactBridgePayload, sanitizeBridgeMessage} from '../../src/bridge/redaction.js';
import {mapAgentEventToBridgeMessage, attachBridgeToEventBus} from '../../src/bridge/eventAdapter.js';
import {EventBus} from '../../src/core/events/bus.js';
import {createEventTimestamp} from '../../src/core/events/events.js';
import {createDiffPreviewMessage} from '../../src/bridge/diffPreview.js';
import {
  createBridgePermissionRequest,
  waitForBridgePermissionDecision,
  resolveBridgePermissionRequest,
} from '../../src/bridge/permissions.js';
import {createBridgeHandlers} from '../../src/cli/setup/bridgeHandlers.js';
import type {BootstrapRuntimeContext} from '../../src/cli/setup/runtimeContext.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-bridge-e2e-'));

const makeContext = (cwd: string): BootstrapRuntimeContext => ({
  cwd,
  configStore: {load: () => Promise.resolve({effective: {}, project: {}, user: {}})} as unknown as BootstrapRuntimeContext['configStore'],
  sessionStore: {} as BootstrapRuntimeContext['sessionStore'],
  taskStore: {} as BootstrapRuntimeContext['taskStore'],
});

describe('E2E: Bridge auth creates token with fingerprint', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await mkdtemp(); });
  afterEach(async () => { await fs.rm(tmpDir, {recursive: true, force: true}); });

  it('createBridgeSecret creates token and 12-char fingerprint', () => {
    const info = createBridgeSecret();
    expect(info.token.length).toBeGreaterThan(16);
    expect(info.fingerprint).toMatch(/^[a-f0-9]{12}$/u);
  });

  it('loadOrCreateBridgeSecret persists across calls', async () => {
    const first = await loadOrCreateBridgeSecret(tmpDir);
    const second = await loadOrCreateBridgeSecret(tmpDir);
    expect(first.token).toBe(second.token);
    expect(fingerprintToken(first.token)).toBe(first.fingerprint);
  });

  it('validateBridgeToken rejects wrong token', () => {
    const info = createBridgeSecret();
    expect(validateBridgeToken('bad-token', info)).toBe(false);
    expect(validateBridgeToken(info.token, info)).toBe(true);
  });
});

describe('E2E: Unauthenticated request rejected', () => {
  it('non-hello request without auth returns UNAUTHENTICATED', async () => {
    const transport = new InMemoryTransport();
    const secretInfo = createBridgeSecret();
    const server = new BridgeServer({transport, secretInfo});
    await server.start();

    const connId = transport.connect({authenticated: false});
    await transport.sendFromClient(connId, createBridgeMessage('task.list', {}, {requestId: 'r1'}));

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.payload['code'] === 'UNAUTHENTICATED')).toBe(true);
    await server.stop();
  });
});

describe('E2E: Authenticated ping succeeds', () => {
  it('connected + authenticated client gets pong', async () => {
    const transport = new InMemoryTransport();
    const server = new BridgeServer({transport});
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, createBridgeMessage('bridge.ping', {}));

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.type === 'bridge.pong')).toBe(true);
    await server.stop();
  });
});

describe('E2E: EventBus task event maps to bridge message', () => {
  it('task.created event arrives at authenticated client', async () => {
    const transport = new InMemoryTransport();
    const server = new BridgeServer({transport});
    await server.start();

    const bus = new EventBus();
    const sub = attachBridgeToEventBus(bus, server);
    const connId = transport.connect({authenticated: true});

    bus.emit({type: 'task.created', taskId: 'test-id', kind: 'agent', title: 'Build OAuth', timestamp: createEventTimestamp()});
    await new Promise((r) => setTimeout(r, 20));

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.type === 'task.created')).toBe(true);

    sub();
    await server.stop();
  });
});

describe('E2E: context.view returns safe empty report', () => {
  it('context.view with no provider returns placeholder', async () => {
    const transport = new InMemoryTransport();
    const server = new BridgeServer({transport});
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, createBridgeMessage('context.view', {}, {requestId: 'ctx1'}));

    const msgs = transport.getClientMessages(connId);
    const resp = msgs.find((m) => m.requestId === 'ctx1');
    expect(resp).toBeDefined();
    expect(resp?.payload['data']).toMatchObject({files: [], tokenCount: 0});
    await server.stop();
  });
});

describe('E2E: diff preview redacts secrets', () => {
  it('patch with sk- key is redacted in preview', () => {
    const diff = `+++ b/src/config.ts\n+const apiKey = 'sk-ant-api-secretxxxxxxxxxxxxxxxxx';\n`;
    const msg = createDiffPreviewMessage(diff);
    const preview = msg.payload['patchPreview'] as string;
    expect(preview).not.toContain('sk-ant-api-secret');
    expect(msg.type).toBe('diff.preview');
  });
});

describe('E2E: permission request timeout denies', () => {
  it('unresolved request returns timeout after short wait', async () => {
    const req = createBridgePermissionRequest('delete important file');
    const decision = await waitForBridgePermissionDecision(req, {timeoutMs: 30});
    expect(decision).toBe('timeout');
  });

  it('manually approved request returns approved', async () => {
    const req = createBridgePermissionRequest('write src/auth.ts');
    const promise = waitForBridgePermissionDecision(req, {timeoutMs: 5000});
    resolveBridgePermissionRequest(req.id, 'approved');
    expect(await promise).toBe('approved');
  });
});

describe('E2E: Bridge CLI routes exist and do not print token', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await mkdtemp(); });
  afterEach(async () => { await fs.rm(tmpDir, {recursive: true, force: true}); });

  it('bridgeStatus handler prints status without full token', async () => {
    const handlers = createBridgeHandlers(makeContext(tmpDir));
    const output: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s: unknown) => { output.push(String(s)); return true; };

    await handlers.bridgeStatus?.();
    process.stdout.write = origWrite;

    const combined = output.join('');
    expect(combined).toContain('Bridge status');
    expect(combined).not.toMatch(/[a-f0-9]{64}/u); // no full token in output
  });

  it('bridgeToken handler without --show shows fingerprint only', async () => {
    const handlers = createBridgeHandlers(makeContext(tmpDir));
    const output: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s: unknown) => { output.push(String(s)); return true; };

    await handlers.bridgeToken?.({show: false});
    process.stdout.write = origWrite;

    const combined = output.join('');
    expect(combined).toContain('fingerprint');
    expect(combined).not.toMatch(/[a-f0-9]{64}/u);
  });
});

describe('E2E: Payload sanitizer protects broadcasts', () => {
  it('sanitizeBridgeMessage removes secrets from payload', () => {
    const msg = createBridgeMessage('task.created', {
      taskId: 'abc',
      secret: 'sk-ant-api-secretxxxxxxxxxxx1234567',
    });
    const sanitized = sanitizeBridgeMessage(msg);
    expect(sanitized.payload['secret']).toBe('[REDACTED]');
    expect(sanitized.payload['taskId']).toBe('abc');
  });

  it('redactBridgePayload handles deeply nested secrets', () => {
    const deep = {a: {b: {c: {secret: 'sk-ant-api-secretxxxxxxxxxx12345678'}}}};
    const result = redactBridgePayload(deep) as {a: {b: {c: {secret: string}}}};
    expect(result.a.b.c.secret).toBe('[REDACTED]');
  });
});

describe('E2E: mapAgentEventToBridgeMessage handles all key types', () => {
  it('tool.started maps to tool.started', () => {
    const event = {
      type: 'tool.started' as const,
      timestamp: createEventTimestamp(),
      toolCall: {id: 'tc1', toolName: 'readFile', status: 'running'},
    };
    const msg = mapAgentEventToBridgeMessage(event as never);
    expect(msg?.type).toBe('tool.started');
  });

  it('unknown events return null', () => {
    const event = {type: 'some.unknown.thing', timestamp: createEventTimestamp()};
    expect(mapAgentEventToBridgeMessage(event as never)).toBeNull();
  });
});
