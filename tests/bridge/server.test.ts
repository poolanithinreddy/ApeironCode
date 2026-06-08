import {describe, expect, it} from 'vitest';
import {BridgeServer, startBridgeServer} from '../../src/bridge/server.js';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';
import {createBridgeMessage} from '../../src/bridge/types.js';
import {createBridgeSecret} from '../../src/bridge/auth.js';

const makeServer = (withAuth = false) => {
  const transport = new InMemoryTransport();
  const secretInfo = withAuth ? createBridgeSecret() : undefined;
  const server = new BridgeServer({transport, secretInfo});
  return {server, transport, secretInfo};
};

describe('BridgeServer', () => {
  it('starts and returns status', async () => {
    const {server} = makeServer();
    await server.start();
    const status = server.getStatus();
    expect(status.running).toBe(true);
    expect(status.localOnly).toBe(true);
    await server.stop();
  });

  it('unauthenticated request (non-hello) returns UNAUTHENTICATED error', async () => {
    const {server, transport} = makeServer(true);
    await server.start();

    const connId = transport.connect({authenticated: false});
    await transport.sendFromClient(connId, createBridgeMessage('bridge.ping', {}, {requestId: 'r1'}));

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.type === 'bridge.error')).toBe(true);
    expect(msgs.some((m) => m.payload['code'] === 'UNAUTHENTICATED')).toBe(true);
    await server.stop();
  });

  it('authenticated ping returns pong', async () => {
    const {server, transport} = makeServer(false);
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, createBridgeMessage('bridge.ping', {}));

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.type === 'bridge.pong')).toBe(true);
    await server.stop();
  });

  it('hello with correct token authenticates connection', async () => {
    const {server, transport, secretInfo} = makeServer(true);
    await server.start();

    const connId = transport.connect({authenticated: false});
    await transport.sendFromClient(
      connId,
      createBridgeMessage('bridge.hello', {token: secretInfo!.token}),
    );

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.type === 'bridge.ready')).toBe(true);
    await server.stop();
  });

  it('hello with wrong token returns AUTH_FAILED', async () => {
    const {server, transport} = makeServer(true);
    await server.start();

    const connId = transport.connect({authenticated: false});
    await transport.sendFromClient(
      connId,
      createBridgeMessage('bridge.hello', {token: 'wrong-token-xyz'}),
    );

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.payload['code'] === 'AUTH_FAILED')).toBe(true);
    await server.stop();
  });

  it('task.list returns empty list when no provider', async () => {
    const {server, transport} = makeServer(false);
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, createBridgeMessage('task.list', {}, {requestId: 'r1'}));

    const msgs = transport.getClientMessages(connId);
    const taskListResp = msgs.find((m) => m.requestId === 'r1');
    expect(taskListResp).toBeDefined();
    expect(taskListResp?.payload['data']).toEqual([]);
    await server.stop();
  });

  it('context.view returns safe placeholder when no provider', async () => {
    const {server, transport} = makeServer(false);
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, createBridgeMessage('context.view', {}, {requestId: 'ctx1'}));

    const msgs = transport.getClientMessages(connId);
    const resp = msgs.find((m) => m.requestId === 'ctx1');
    expect(resp?.payload['data']).toBeDefined();
    await server.stop();
  });

  it('invalid message returns INVALID_MESSAGE error', async () => {
    const {server, transport} = makeServer(false);
    await server.start();

    const connId = transport.connect({authenticated: true});
    await transport.sendFromClient(connId, 'not-a-message' as never);

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m) => m.payload['code'] === 'INVALID_MESSAGE')).toBe(true);
    await server.stop();
  });

  it('broadcast sanitizes payload', async () => {
    const {server, transport} = makeServer(false);
    await server.start();

    const connId = transport.connect({authenticated: true});
    await server.broadcast(createBridgeMessage('task.updated', {
      status: 'running',
      secret: 'sk-ant-api-secretxxxxxxxxxx1234567',
    }));

    const msgs = transport.getClientMessages(connId);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0];
    expect(msg?.payload['status']).toBe('running');
    expect(msg?.payload['secret']).toBe('[REDACTED]');
    await server.stop();
  });
});

describe('startBridgeServer', () => {
  it('creates and starts server', async () => {
    const server = await startBridgeServer();
    expect(server.getStatus().running).toBe(true);
    await server.stop();
  });
});
