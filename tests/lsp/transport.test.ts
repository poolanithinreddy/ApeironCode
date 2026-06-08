import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {LspTransport, type LspJsonRpcNotification} from '../../src/lsp/transport.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspTransport', () => {
  const transports: LspTransport[] = [];

  afterEach(async () => {
    await Promise.all(transports.splice(0).map(async (transport) => {
      await transport.disconnect();
    }));
  });

  const createTransport = async (): Promise<LspTransport> => {
    const transport = new LspTransport();
    transports.push(transport);
    await transport.connect({
      args: [mockServerPath],
      command: process.execPath,
    });
    return transport;
  };

  it('sends framed requests and receives responses', async () => {
    const transport = await createTransport();

    const response = await transport.request('initialize', {
      capabilities: {},
      clientInfo: {name: 'vitest', version: '1.0.0'},
      processId: process.pid,
      rootUri: null,
    });

    expect(response).toEqual({
      capabilities: {
        documentSymbolProvider: true,
      },
      serverInfo: {
        name: 'mock-lsp',
        version: '1.0.0',
      },
    });
  });

  it('parses notifications emitted between requests', async () => {
    const transport = await createTransport();
    const notifications: LspJsonRpcNotification[] = [];
    transport.setNotificationHandler((message) => {
      notifications.push(message);
    });

    const response = await transport.request('custom/notify', {value: 'ok'});

    expect(response).toEqual({notified: true});
    expect(notifications).toEqual([
      {
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          diagnostics: [],
          uri: 'file:///tmp/example.ts',
        },
      },
    ]);
  });

  it('handles chunked framed responses', async () => {
    const transport = await createTransport();

    const response = await transport.request('custom/chunked');

    expect(response).toEqual({chunked: true});
  });
});