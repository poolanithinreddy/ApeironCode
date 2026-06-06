import process from 'node:process';

let buffer = Buffer.alloc(0);
const openDocuments = new Map();
let initialized = false;
const stats = {
  didChange: 0,
  didClose: 0,
  didOpen: 0,
};

const getOptionValue = (flagName) => {
  const match = process.argv.slice(2).find((value) => value.startsWith(`${flagName}=`));
  return match ? match.slice(flagName.length + 1) : null;
};

const delayMs = Number.parseInt(getOptionValue('--delay-ms') ?? '0', 10);
const delayMethod = getOptionValue('--delay-method');
const exitOnMethod = getOptionValue('--exit-on-method');
const invalidResponseMethod = getOptionValue('--invalid-response-method');
const publishDiagnostics = process.argv.includes('--publish-diagnostics');

const maybeExitForMethod = (method) => {
  if (exitOnMethod && exitOnMethod === method) {
    process.exit(1);
  }
};

const sendNow = (message, chunked = false) => {
  const body = JSON.stringify(message);
  const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;

  if (!chunked) {
    process.stdout.write(frame);
    return;
  }

  const splitIndex = Math.max(1, Math.min(frame.length - 1, 24));
  process.stdout.write(frame.slice(0, splitIndex));
  setTimeout(() => {
    process.stdout.write(frame.slice(splitIndex));
  }, 0);
};

const send = (message, options = {}) => {
  const {chunked = false, method = null} = options;
  const shouldDelay = delayMs > 0 && (!delayMethod || delayMethod === method);
  if (shouldDelay) {
    setTimeout(() => {
      sendNow(message, chunked);
    }, delayMs);
    return;
  }

  sendNow(message, chunked);
};

const buildDocumentSymbols = () => {
  return [
    {
      children: [
        {
          kind: 6,
          name: 'run',
          range: {
            end: {character: 12, line: 5},
            start: {character: 2, line: 3},
          },
          selectionRange: {
            end: {character: 5, line: 3},
            start: {character: 2, line: 3},
          },
        },
      ],
      kind: 5,
      name: 'MockAgent',
      range: {
        end: {character: 1, line: 8},
        start: {character: 0, line: 1},
      },
      selectionRange: {
        end: {character: 9, line: 1},
        start: {character: 6, line: 1},
      },
    },
    {
      kind: 12,
      name: 'runAgentLoop',
      range: {
        end: {character: 1, line: 12},
        start: {character: 0, line: 10},
      },
      selectionRange: {
        end: {character: 12, line: 10},
        start: {character: 7, line: 10},
      },
    },
  ];
};

const handleMessage = (message) => {
  maybeExitForMethod(message.method);

  switch (message.method) {
    case 'initialize':
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {
          capabilities: {
            documentSymbolProvider: true,
          },
          serverInfo: {
            name: 'mock-lsp',
            version: '1.0.0',
          },
        },
      }, {method: 'initialize'});
      return;
    case 'initialized':
      initialized = true;
      return;
    case 'textDocument/didOpen': {
      const uri = message.params?.textDocument?.uri;
      openDocuments.set(uri, message.params?.textDocument?.text ?? '');
      stats.didOpen += 1;
      if (publishDiagnostics) {
        setTimeout(() => {
          send({
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: {
              uri,
              diagnostics: [
                {
                  range: {start: {line: 1, character: 0}, end: {line: 1, character: 10}},
                  severity: 2,
                  message: 'Mock warning',
                  code: 'MOCK_001',
                },
              ],
            },
          }, {method: 'textDocument/publishDiagnostics'});
        }, 10);
      }
      return;
    }
    case 'textDocument/didChange': {
      const uri = message.params?.textDocument?.uri;
      const nextText = message.params?.contentChanges?.[0]?.text;
      if (uri && typeof nextText === 'string') {
        openDocuments.set(uri, nextText);
      }
      stats.didChange += 1;
      if (publishDiagnostics && uri) {
        setTimeout(() => {
          send({
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: {
              uri,
              diagnostics: [
                {
                  range: {start: {line: 1, character: 0}, end: {line: 1, character: 10}},
                  severity: 2,
                  message: 'Mock warning',
                  code: 'MOCK_001',
                },
              ],
            },
          }, {method: 'textDocument/publishDiagnostics'});
        }, 10);
      }
      return;
    }
    case 'textDocument/didClose': {
      const uri = message.params?.textDocument?.uri;
      if (uri) {
        openDocuments.delete(uri);
      }
      stats.didClose += 1;
      return;
    }
    case 'custom/notify':
      send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          diagnostics: [],
          uri: 'file:///tmp/example.ts',
        },
      });
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {notified: true},
      }, {method: 'custom/notify'});
      return;
    case 'custom/chunked':
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {chunked: true},
      }, {chunked: true, method: 'custom/chunked'});
      return;
    case 'custom/stats':
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {
          initialized,
          openDocuments: openDocuments.size,
          stats,
        },
      }, {method: 'custom/stats'});
      return;
    case 'textDocument/documentSymbol': {
      const uri = message.params?.textDocument?.uri;
      if (invalidResponseMethod === 'textDocument/documentSymbol') {
        send({
          id: message.id,
          jsonrpc: '2.0',
          result: {invalid: true},
        }, {method: 'textDocument/documentSymbol'});
        return;
      }

      if (!initialized) {
        send({
          error: {
            code: -32002,
            message: 'initialized notification was not received',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/documentSymbol'});
        return;
      }

      if (!openDocuments.has(uri)) {
        send({
          error: {
            code: -32001,
            message: 'document was not opened',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/documentSymbol'});
        return;
      }

      send({
        id: message.id,
        jsonrpc: '2.0',
        result: buildDocumentSymbols(),
      }, {method: 'textDocument/documentSymbol'});
      return;
    }
    case 'textDocument/definition': {
      const uri = message.params?.textDocument?.uri;
      if (!initialized) {
        send({
          error: {
            code: -32002,
            message: 'initialized notification was not received',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/definition'});
        return;
      }

      if (!openDocuments.has(uri)) {
        send({
          error: {
            code: -32001,
            message: 'document was not opened',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/definition'});
        return;
      }

      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {
          uri,
          range: {
            start: {line: 5, character: 0},
            end: {line: 5, character: 9},
          },
        },
      }, {method: 'textDocument/definition'});
      return;
    }
    case 'textDocument/references': {
      const uri = message.params?.textDocument?.uri;
      const includeDeclaration = message.params?.context?.includeDeclaration !== false;
      if (!initialized) {
        send({
          error: {
            code: -32002,
            message: 'initialized notification was not received',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/references'});
        return;
      }

      if (!openDocuments.has(uri)) {
        send({
          error: {
            code: -32001,
            message: 'document was not opened',
          },
          id: message.id,
          jsonrpc: '2.0',
        }, {method: 'textDocument/references'});
        return;
      }

      const references = [];
      if (includeDeclaration) {
        references.push({
          uri,
          range: {
            start: {line: 10, character: 0},
            end: {line: 10, character: 12},
          },
        });
      }

      references.push({
        uri,
        range: {
          start: {line: 20, character: 5},
          end: {line: 20, character: 17},
        },
      });

      send({
        id: message.id,
        jsonrpc: '2.0',
        result: references,
      }, {method: 'textDocument/references'});
      return;
    }
    case 'shutdown':
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: null,
      }, {method: 'shutdown'});
      return;
    default:
      send({
        id: message.id,
        jsonrpc: '2.0',
        result: {echo: message.params ?? null},
      }, {method: message.method});
  }
};

const processMessages = () => {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const headerBlock = buffer.subarray(0, headerEnd).toString('utf8');
    const match = headerBlock.match(/Content-Length:\s*(\d+)/i);
    const bodyStart = headerEnd + 4;
    if (!match) {
      buffer = buffer.subarray(bodyStart);
      continue;
    }

    const contentLength = Number.parseInt(match[1] ?? '', 10);
    if (buffer.length < bodyStart + contentLength) {
      return;
    }

    const body = buffer.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
    buffer = buffer.subarray(bodyStart + contentLength);

    const message = JSON.parse(body);
    if (message.method === 'exit') {
      process.exit(0);
    }

    handleMessage(message);
  }
};

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processMessages();
});