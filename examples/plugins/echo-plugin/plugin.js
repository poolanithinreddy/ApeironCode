let input = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const {tool, input: toolInput} = data;

    if (tool === 'echo') {
      const text = toolInput.text || '';
      const result = {
        ok: true,
        message: `Echo: ${text}`,
        timestamp: new Date().toISOString(),
      };
      process.stdout.write(JSON.stringify(result));
    } else if (tool === 'uppercase') {
      const text = toolInput.text || '';
      const result = {
        ok: true,
        message: text.toUpperCase(),
        timestamp: new Date().toISOString(),
      };
      process.stdout.write(JSON.stringify(result));
    } else {
      const error = {
        ok: false,
        error: `Unknown tool: ${tool}`,
      };
      process.stdout.write(JSON.stringify(error));
      process.exit(1);
    }
  } catch (err) {
    const error = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    process.stdout.write(JSON.stringify(error));
    process.exit(1);
  }
});
