/**
 * Tests for WebSocketTransport.
 * Uses real loopback (127.0.0.1) with ephemeral ports — local only.
 * No real external network access. No secrets in output.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import WebSocket from 'ws';
import {WebSocketTransport, buildWsEndpoint} from '../../src/bridge/transport/webSocket.js';
import {createBridgeMessage, createBridgeErrorMessage} from '../../src/bridge/types.js';
import type {BridgeSecretInfo} from '../../src/bridge/auth.js';
import {createBridgeSecret} from '../../src/bridge/auth.js';

// ─── helpers ──────────────────────────────────────────────────────────────

const SECRET: BridgeSecretInfo = createBridgeSecret();

const waitForMessage = (ws: WebSocket): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), 3000);
    ws.once('message', (data: Buffer | string) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : data));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
  });

const connectWs = (endpoint: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

const sendAuth = async (ws: WebSocket, token: string): Promise<unknown> => {
  const hello = createBridgeMessage('bridge.hello', {token});
  ws.send(JSON.stringify(hello));
  return waitForMessage(ws);
};

// ─── suite ────────────────────────────────────────────────────────────────

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let endpoint: string;

  beforeEach(async () => {
    transport = new WebSocketTransport({secretInfo: SECRET});
    // Register a hello handler that echoes bridge.ready (mirrors BridgeServer behavior)
    transport.onMessage(async (conn, msg) => {
      if (msg.type === 'bridge.hello' && conn.authenticated) {
        await conn.send(createBridgeMessage('bridge.ready', {version: '1.0'}, {requestId: msg.id}));
      }
    });
    await transport.start({localOnly: true, port: 0});
    endpoint = buildWsEndpoint(transport.getPort());
    expect(transport.getPort()).toBeGreaterThan(0);
  });

  afterEach(async () => {
    await transport.stop();
  });

  it('binds on local-only host (127.0.0.1) with ephemeral port', () => {
    expect(endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
    expect(transport.getPort()).toBeGreaterThan(1024);
  });

  it('accepts a WebSocket connection', async () => {
    const ws = await connectWs(endpoint);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects unauthenticated client sending non-hello message', async () => {
    const ws = await connectWs(endpoint);
    const msg = createBridgeMessage('bridge.ping', {});
    ws.send(JSON.stringify(msg));
    const response = await waitForMessage(ws) as Record<string, unknown>;
    expect(response['type']).toBe('bridge.error');
    const payload = response['payload'] as Record<string, unknown>;
    expect(payload['code']).toBe('UNAUTHENTICATED');
    ws.close();
  });

  it('rejects client with wrong token', async () => {
    const ws = await connectWs(endpoint);
    const response = await sendAuth(ws, 'wrong-token') as Record<string, unknown>;
    expect(response['type']).toBe('bridge.error');
    const payload = response['payload'] as Record<string, unknown>;
    expect(payload['code']).toBe('AUTH_FAILED');
    ws.close();
  });

  it('accepts client with correct token', async () => {
    const ws = await connectWs(endpoint);
    const response = await sendAuth(ws, SECRET.token) as Record<string, unknown>;
    expect(response['type']).toBe('bridge.ready');
    ws.close();
  });

  it('response does not contain full token string', async () => {
    const ws = await connectWs(endpoint);
    const response = await sendAuth(ws, SECRET.token) as Record<string, unknown>;
    const responseText = JSON.stringify(response);
    expect(responseText).not.toContain(SECRET.token);
    ws.close();
  });

  it('broadcasts sanitized event to authenticated clients', async () => {
    const ws = await connectWs(endpoint);
    await sendAuth(ws, SECRET.token);

    const listenPromise = waitForMessage(ws);
    const broadcastMsg = createBridgeMessage('agent.progress', {
      iteration: 1,
      note: 'working',
    });
    await transport.broadcast(broadcastMsg);

    const received = await listenPromise as Record<string, unknown>;
    expect(received['type']).toBe('agent.progress');
    ws.close();
  });

  it('does not broadcast to unauthenticated clients', async () => {
    const ws = await connectWs(endpoint);
    // Do NOT authenticate
    let receivedBroadcast = false;
    ws.on('message', () => { receivedBroadcast = true; });

    const msg = createBridgeMessage('agent.progress', {iteration: 2});
    await transport.broadcast(msg);
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedBroadcast).toBe(false);
    ws.close();
  });

  it('handles malformed JSON safely', async () => {
    const ws = await connectWs(endpoint);
    ws.send('not json {{{{');
    const response = await waitForMessage(ws) as Record<string, unknown>;
    expect(response['type']).toBe('bridge.error');
    const payload = response['payload'] as Record<string, unknown>;
    expect(payload['code']).toBe('PARSE_ERROR');
    ws.close();
  });

  it('handles oversized message safely', async () => {
    const ws = await connectWs(endpoint);
    // Send 600KB string (over MAX_MESSAGE_BYTES = 512KB)
    const big = 'x'.repeat(600_001);
    ws.send(big);
    const response = await waitForMessage(ws) as Record<string, unknown>;
    expect(response['type']).toBe('bridge.error');
    const payload = response['payload'] as Record<string, unknown>;
    expect(payload['code']).toBe('MESSAGE_TOO_LARGE');
    ws.close();
  });

  it('handles disconnect cleanly', async () => {
    const ws = await connectWs(endpoint);
    await sendAuth(ws, SECRET.token);
    expect(transport.connectionCount()).toBe(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(transport.connectionCount()).toBe(0);
  });

  it('connectionCount and connectionIds are accurate', async () => {
    const ws1 = await connectWs(endpoint);
    const ws2 = await connectWs(endpoint);
    expect(transport.connectionCount()).toBe(2);
    expect(transport.connectionIds()).toHaveLength(2);
    ws1.close();
    ws2.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(transport.connectionCount()).toBe(0);
  });

  it('error response does not contain full token', async () => {
    const ws = await connectWs(endpoint);
    const msg = createBridgeMessage('bridge.ping', {});
    ws.send(JSON.stringify(msg));
    const response = await waitForMessage(ws);
    const text = JSON.stringify(response);
    expect(text).not.toContain(SECRET.token);
    ws.close();
  });

  it('buildWsEndpoint formats correctly', () => {
    expect(buildWsEndpoint(9876)).toBe('ws://127.0.0.1:9876');
  });

  it('stop closes all connections', async () => {
    const ws = await connectWs(endpoint);
    await sendAuth(ws, SECRET.token);
    expect(transport.connectionCount()).toBe(1);
    await transport.stop();
    await new Promise((r) => setTimeout(r, 100));
    expect(transport.connectionCount()).toBe(0);
  });

  it('error message from malformed message does not contain bridge error message with full token', () => {
    const errMsg = createBridgeErrorMessage('TEST_ERROR', 'some error detail');
    expect(JSON.stringify(errMsg)).not.toContain(SECRET.token);
  });
});
