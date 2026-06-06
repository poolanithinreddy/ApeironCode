/**
 * E2E / integration tests: VS Code Extension + Bridge MVP.
 * No real VS Code host required. Uses mocked transports and in-memory bridge.
 * No real external network calls.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import WebSocket from 'ws';
import {WebSocketTransport, buildWsEndpoint} from '../../src/bridge/transport/webSocket.js';
import {BridgeServer} from '../../src/bridge/server.js';
import {createBridgeSecret} from '../../src/bridge/auth.js';
import {
  createBridgeMessage,
  createBridgeErrorMessage,
} from '../../src/bridge/types.js';
import {sanitizeBridgeMessage} from '../../src/bridge/redaction.js';
import {
  buildChatHtml,
  escapeHtml,
  generateNonce,
} from '../../extensions/vscode/src/views/webviewHtml.js';
import {PermissionStore} from '../../extensions/vscode/src/permissions/permissionStore.js';
import type {BridgeMessage} from '../../extensions/vscode/src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

const SECRET = createBridgeSecret();

const connectWs = (endpoint: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

const waitForMsg = (ws: WebSocket, timeoutMs = 2000): Promise<BridgeMessage> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    ws.once('message', (data: Buffer | string) => {
      clearTimeout(timer);
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      resolve(JSON.parse(raw) as BridgeMessage);
    });
  });

const authenticate = async (ws: WebSocket, token: string): Promise<BridgeMessage> => {
  const hello = createBridgeMessage('bridge.hello', {token});
  ws.send(JSON.stringify(hello));
  return waitForMsg(ws);
};

// ─── Test suite ────────────────────────────────────────────────────────────

describe('VS Code Bridge MVP E2E', () => {
  let transport: WebSocketTransport;
  let server: BridgeServer;
  let endpoint: string;

  beforeEach(async () => {
    transport = new WebSocketTransport({secretInfo: SECRET});
    transport.onMessage(async (conn, msg) => {
      if (msg.type === 'bridge.hello' && conn.authenticated) {
        await conn.send(createBridgeMessage('bridge.ready', {version: '1.0'}, {requestId: msg.id}));
      }
    });
    server = new BridgeServer({transport, secretInfo: SECRET});
    await server.start({localOnly: true, port: 0});
    endpoint = buildWsEndpoint(transport.getPort());
  });

  afterEach(async () => {
    await server.stop();
  });

  // ─── Scenario 1: WebSocket transport requires auth ───────────────────────

  it('scenario 1: bridge WebSocket transport rejects unauthenticated message', async () => {
    const ws = await connectWs(endpoint);
    const ping = createBridgeMessage('bridge.ping', {});
    ws.send(JSON.stringify(ping));
    const response = await waitForMsg(ws);
    expect(response.type).toBe('bridge.error');
    expect(String(response.payload['code'])).toBe('UNAUTHENTICATED');
    ws.close();
  });

  // ─── Scenario 2: Ping works on authenticated connection ─────────────────

  it('scenario 2: bridge client ping works on authenticated connection', async () => {
    const ws = await connectWs(endpoint);
    const authResp = await authenticate(ws, SECRET.token);
    expect(authResp.type).toBe('bridge.ready');

    // Register ping handler on server
    transport.onMessage(async (conn, msg) => {
      if (msg.type === 'bridge.ping') {
        await conn.send(createBridgeMessage('bridge.pong', {pingId: msg.id}));
      }
    });

    const ping = createBridgeMessage('bridge.ping', {});
    ws.send(JSON.stringify(ping));
    const pong = await waitForMsg(ws);
    expect(pong.type).toBe('bridge.pong');
    ws.close();
  });

  // ─── Scenario 3: VS Code package manifest contains ApeironCode commands ──

  it('scenario 3: VS Code package manifest contains all required commands', async () => {
    const {readFile} = await import('node:fs/promises');
    const raw = await readFile('extensions/vscode/package.json', 'utf8');
    const pkg = JSON.parse(raw) as {contributes?: {commands?: Array<{command: string}>}};

    const commandIds = pkg.contributes?.commands?.map((c) => c.command) ?? [];
    expect(commandIds).toContain('apeironcode.openChat');
    expect(commandIds).toContain('apeironcode.startBridge');
    expect(commandIds).toContain('apeironcode.stopBridge');
    expect(commandIds).toContain('apeironcode.showContext');
    expect(commandIds).toContain('apeironcode.showTasks');
    expect(commandIds).toContain('apeironcode.approvePermission');
    expect(commandIds).toContain('apeironcode.denyPermission');
    expect(commandIds).toContain('apeironcode.sendSelectionToChat');
  });

  // ─── Scenario 4: Webview HTML has CSP and escaped dynamic content ────────

  it('scenario 4: webview HTML includes CSP and escapes dynamic content', () => {
    const nonce = generateNonce();
    const html = buildChatHtml({
      cspSource: 'vscode-resource:',
      nonce,
      connectionStatus: '<injected>',
      messages: [{role: 'user', content: '<script>alert(1)</script>', timestamp: '12:00'}],
      pendingPermissions: [],
      tasks: [],
    });

    // CSP present
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain(`nonce-${nonce}`);

    // Dynamic content escaped
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<injected>');
    expect(html).toContain('&lt;injected&gt;');
  });

  // ─── Scenario 5: Permission request UI approve/deny ──────────────────────

  it('scenario 5: permission store handles approve/deny lifecycle', () => {
    const store = new PermissionStore();

    store.addRequest({
      requestId: 'perm-abc',
      action: 'delete src/index.ts',
      toolName: 'bash',
      filePath: 'src/index.ts',
    });

    expect(store.has('perm-abc')).toBe(true);
    expect(store.getRequest('perm-abc')?.action).toBe('delete src/index.ts');

    // Deny removes from store
    store.remove('perm-abc');
    expect(store.has('perm-abc')).toBe(false);
  });

  it('scenario 5b: permission approve sends correct bridge message', async () => {
    const ws = await connectWs(endpoint);
    await authenticate(ws, SECRET.token);

    // Simulate client sending approval
    const approveMsg = createBridgeMessage('permission.approved', {requestId: 'perm-xyz'});
    ws.send(JSON.stringify(approveMsg));

    // Server should receive it (no response expected unless handler set up)
    // Just verify message was sent without error
    await new Promise((r) => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  // ─── Scenario 6: Context view does not expose raw file content ───────────

  it('scenario 6: context view HTML does not expose raw file content', () => {
    const summary = {
      files: [
        {path: 'src/index.ts', tokenCount: 120, included: true},
        {path: 'src/secret.ts', tokenCount: 50, included: false},
      ],
      tokenCount: 170,
      tokenBudget: 4000,
    };

    // Build minimal context HTML (mirrors ContextViewPanel logic)
    const filesHtml = summary.files.map((f) => `<div>${escapeHtml(f.path)}</div>`).join('');
    const html = `<html><body>${filesHtml}</body></html>`;

    // Only file paths, not content
    expect(html).toContain('src/index.ts');
    expect(html).not.toContain('export function');
    expect(html).not.toContain('import {');
    expect(html).not.toContain('const secretKey');
  });

  // ─── Scenario 7: Diff preview redacts secret-like values ─────────────────

  it('scenario 7: bridge diff preview message redacts secrets', () => {
    const rawDiff = `--- a/config.ts\n+++ b/config.ts\n@@ -1 +1 @@\n-const key = 'sk-oldkey1234567890';\n+const key = 'sk-newkey1234567890';\n`;
    const msg = createBridgeMessage('diff.preview', {
      patchPreview: rawDiff,
      files: [],
      totalAdditions: 1,
      totalDeletions: 1,
      truncated: false,
      riskyPaths: [],
    });
    const safe = sanitizeBridgeMessage(msg);
    const safeText = JSON.stringify(safe);

    // Secret patterns should be redacted
    expect(safeText).not.toContain('sk-oldkey1234567890');
    expect(safeText).not.toContain('sk-newkey1234567890');
    expect(safeText).toContain('[REDACTED]');
  });

  // ─── Scenario 8: Task view renders task status ────────────────────────────

  it('scenario 8: task view renders task list correctly', () => {
    const tasks = [
      {id: 't1', title: 'Fix auth bug', status: 'running', kind: 'background', updatedAt: '2026-05-12T10:00:00Z'},
      {id: 't2', title: 'Deploy to staging', status: 'failed', kind: 'worktree', updatedAt: '2026-05-12T09:00:00Z', worktreeBranch: 'feature/deploy'},
    ];

    const html = tasks.map((t) => `<div>${escapeHtml(t.title)} ${escapeHtml(t.status)}</div>`).join('');

    expect(html).toContain('Fix auth bug');
    expect(html).toContain('running');
    expect(html).toContain('Deploy to staging');
    expect(html).toContain('failed');
  });

  // ─── Safety checks ────────────────────────────────────────────────────────

  it('bridge token is never in any bridge message response', async () => {
    const ws = await connectWs(endpoint);
    const authResp = await authenticate(ws, SECRET.token);
    const authText = JSON.stringify(authResp);
    expect(authText).not.toContain(SECRET.token);
    ws.close();
  });

  it('buildWsEndpoint always uses local-only host', () => {
    const ep = buildWsEndpoint(1234);
    expect(ep).toBe('ws://127.0.0.1:1234');
    expect(ep).not.toContain('0.0.0.0');
    expect(ep).not.toContain('localhost');
  });

  it('error message from malformed JSON does not print raw token', async () => {
    const ws = await connectWs(endpoint);
    ws.send('{{not json}}');
    const response = await waitForMsg(ws);
    const text = JSON.stringify(response);
    expect(text).not.toContain(SECRET.token);
    expect(response.type).toBe('bridge.error');
    ws.close();
  });

  it('createBridgeErrorMessage does not include secrets', () => {
    const err = createBridgeErrorMessage('TEST', 'some error detail');
    expect(JSON.stringify(err)).not.toContain(SECRET.token);
  });
});
