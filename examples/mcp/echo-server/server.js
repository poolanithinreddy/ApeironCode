let buffer = '';

const tools = [
  {
    name: 'echo',
    description: 'Echoes back the input text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {type: 'string', description: 'Text to echo'},
      },
      required: ['text'],
    },
  },
  {
    name: 'uppercase',
    description: 'Converts text to uppercase',
    inputSchema: {
      type: 'object',
      properties: {
        text: {type: 'string', description: 'Text to convert'},
      },
      required: ['text'],
    },
  },
];

const sendResponse = (id, result) => {
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id,
    result,
  }) + '\n');
};

const sendError = (id, message) => {
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -1,
      message,
    },
  }) + '\n');
};

const handleRequest = (request) => {
  const {id, method, params} = request;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'echo-mcp-server',
        version: '0.1.0',
      },
    });
  } else if (method === 'tools/list') {
    sendResponse(id, {tools});
  } else if (method === 'tools/call') {
    const {name, arguments: args} = params;
    if (name === 'echo') {
      const text = args?.text || '';
      sendResponse(id, {
        content: [{
          type: 'text',
          text: `Echo: ${text}`,
        }],
      });
    } else if (name === 'uppercase') {
      const text = args?.text || '';
      sendResponse(id, {
        content: [{
          type: 'text',
          text: text.toUpperCase(),
        }],
      });
    } else {
      sendError(id, `Unknown tool: ${name}`);
    }
  } else {
    sendError(id, `Unknown method: ${method}`);
  }
};

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      handleRequest(request);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});
