#!/usr/bin/env node

/**
 * Minimal MCP echo server for testing.
 * Implements: echo, uppercase tools via stdio JSON-RPC transport.
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(message) {
  console.log(JSON.stringify(message));
}

function handleInitialize(request) {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: {
        name: 'echo-mcp-test-server',
        version: '1.0.0',
      },
    },
  };
}

function handleToolsList(request) {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      tools: [
        {
          name: 'echo',
          description: 'Echo the input text back',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to echo',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'uppercase',
          description: 'Convert text to uppercase',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to uppercase',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'fail',
          description: 'Fail intentionally for workflow testing',
          inputSchema: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Optional failure reason',
              },
            },
          },
        },
      ],
    },
  };
}

function handleCallTool(request) {
  const {name, arguments: args} = request.params;

  if (name === 'echo') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: `Echo: ${args.text || ''}`,
          },
        ],
        isError: false,
      },
    };
  }

  if (name === 'uppercase') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: (args.text || '').toUpperCase(),
          },
        ],
        isError: false,
      },
    };
  }

  if (name === 'fail') {
    process.stderr.write(`intentional failure: ${args.reason || 'no reason provided'}\n`);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32001,
        message: `Intentional MCP failure: ${args.reason || 'no reason provided'}`,
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id: request.id,
    error: {
      code: -32601,
      message: `Unknown tool: ${name}`,
    },
  };
}

rl.on('line', (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line);

    if (request.method === 'initialize') {
      send(handleInitialize(request));
    } else if (request.method === 'tools/list') {
      send(handleToolsList(request));
    } else if (request.method === 'tools/call') {
      send(handleCallTool(request));
    } else {
      send({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Unknown method: ${request.method}`,
        },
      });
    }
  } catch {
    send({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });
  }
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
