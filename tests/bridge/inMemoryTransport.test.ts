import {describe, expect, it, beforeEach} from 'vitest';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';
import {createBridgeMessage} from '../../src/bridge/types.js';

describe('InMemoryTransport', () => {
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.start({localOnly: true});
  });

  it('starts and reports running', () => {
    expect(transport.isRunning()).toBe(true);
  });

  it('connects a client and increments count', () => {
    transport.connect();
    expect(transport.connectionCount()).toBe(1);
  });

  it('delivers message from server to client via send', async () => {
    const connId = transport.connect({authenticated: true});
    const msg = createBridgeMessage('bridge.pong', {pingId: 'p1'});
    await transport.send(connId, msg);
    const received = transport.getClientMessages(connId);
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('bridge.pong');
  });

  it('broadcasts to all authenticated connections', async () => {
    const conn1 = transport.connect({authenticated: true});
    const conn2 = transport.connect({authenticated: true});
    const unauthConn = transport.connect({authenticated: false});

    const msg = createBridgeMessage('task.updated', {status: 'running'});
    await transport.broadcast(msg);

    expect(transport.getClientMessages(conn1)).toHaveLength(1);
    expect(transport.getClientMessages(conn2)).toHaveLength(1);
    expect(transport.getClientMessages(unauthConn)).toHaveLength(0);
  });

  it('delivers client message to message handler', async () => {
    const received: Array<{connId: string; type: string}> = [];
    transport.onMessage((conn, msg) => {
      received.push({connId: conn.id, type: msg.type});
      return Promise.resolve();
    });

    const connId = transport.connect();
    const msg = createBridgeMessage('bridge.ping', {});
    await transport.sendFromClient(connId, msg);

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('bridge.ping');
  });

  it('fires onConnection handler when client connects', () => {
    const connected: string[] = [];
    transport.onConnection((conn) => connected.push(conn.id));
    const id = transport.connect();
    expect(connected).toContain(id);
  });

  it('fires onClose handler when connection closes', () => {
    const closed: string[] = [];
    transport.onClose((id) => closed.push(id));
    const id = transport.connect();
    transport.getConnection(id)?.close();
    expect(closed).toContain(id);
  });

  it('stops and clears connections', async () => {
    transport.connect();
    transport.connect();
    await transport.stop();
    expect(transport.connectionCount()).toBe(0);
    expect(transport.isRunning()).toBe(false);
  });
});
