import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {BridgeServer} from '../../src/bridge/server.js';
import {createBridgeMessage} from '../../src/bridge/types.js';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';

const connect = async (): Promise<{connectionId: string; transport: InMemoryTransport}> => {
  const transport = new InMemoryTransport();
  const server = new BridgeServer({transport});
  await server.start({localOnly: true});
  const connectionId = transport.connect();
  await transport.sendFromClient(connectionId, createBridgeMessage('bridge.hello', {}));
  return {connectionId, transport};
};

describe('Project Brain bridge messages', () => {
  it('previews and refuses unapproved init without silent writes', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-bridge-'));
    const {connectionId, transport} = await connect();
    await transport.sendFromClient(connectionId, createBridgeMessage('brain.plan', {cwd}, {requestId: 'plan'}));
    expect(transport.getClientMessages(connectionId).at(-1)?.type).toBe('brain.plan');
    await transport.sendFromClient(connectionId, createBridgeMessage('brain.init', {approved: false, cwd}, {requestId: 'init'}));
    expect(transport.getClientMessages(connectionId).at(-1)?.type).toBe('brain.init');
    await expect(fs.access(path.join(cwd, '.apeironcode'))).rejects.toThrow();
    await transport.stop();
  });
});
