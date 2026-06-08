# MCP

The current MCP integration is real but still experimental.

What is wired today:

- configured MCP endpoint discovery from project config and plugin manifests
- `apeironcode mcp list`
- `apeironcode mcp add stdio <id> --command ... --args ...`
- `apeironcode mcp add http <id> --url ...`
- `apeironcode mcp add sse <id> --url ...`
- `apeironcode mcp remove|enable|disable <server>`
- `apeironcode mcp tools <server>`
- `apeironcode mcp tools --all`
- `apeironcode mcp search <query>`
- `apeironcode mcp call <server> <tool> --json '{}'`
- `apeironcode mcp resources <server>`
- `apeironcode mcp read <server> <resource-uri>`
- `apeironcode mcp read <server> <resource-uri> --add-to-context`
- `apeironcode mcp prompts <server>`
- `apeironcode mcp prompt <server> <prompt-name> --preview`
- `apeironcode mcp permissions <server>`
- `apeironcode mcp allow <server> <tool>`
- `apeironcode mcp deny <server> <tool>`
- `apeironcode mcp auth login|status|logout <server>`
- `apeironcode mcp test <server>`
- `/mcp list`
- `/mcp tools <server>`
- `/mcp test <server>`
- runtime tool loading into the normal tool registry
- managed stdio server lifecycle with cached connections, stderr capture, tool listing, and tool execution

## Configuration

Project config example:

```json
{
  "mcp": {
    "servers": {
      "echo-test": {
        "type": "stdio",
        "command": "node",
        "args": ["tests/fixtures/mcp-workspace/server.mjs"],
        "env": {},
        "enabled": true,
        "trustLevel": "low",
        "allowedTools": ["echo"],
        "deniedTools": [],
        "outputTokenLimit": 1200
      }
    }
  }
}
```

Plugin manifests can also contribute `mcpServers`. If both a plugin and the project config define the same server name, the project config entry wins.

## Commands

```bash
apeironcode mcp list
apeironcode mcp add stdio echo-test --command node --args examples/mcp/echo-server/server.js
apeironcode mcp add http docs --url https://mcp.example/rpc
apeironcode mcp add sse events --url https://mcp.example/sse
apeironcode mcp tools echo-test
apeironcode mcp tools --all
apeironcode mcp search issues
apeironcode mcp call echo-test echo --json '{"text":"hello"}'
apeironcode mcp resources echo-test
apeironcode mcp read echo-test file://notes.md --add-to-context
apeironcode mcp prompts echo-test
apeironcode mcp prompt echo-test review --preview
apeironcode mcp permissions echo-test
apeironcode mcp auth status echo-test
apeironcode mcp test echo-test
```

In the TUI:

```text
/mcp list
/mcp tools echo-test
/mcp test echo-test
```

## Runtime Behavior

- MCP tools are loaded into the normal tool registry, so they participate in the same loop, audit logging, and tool-error handling as built-in and plugin tools.
- Tool names preserve the `mcp:<server>.<tool>` namespace in the runtime and provider-native registration paths.
- Server config supports `stdio`, `http`, and `sse` transport shapes. HTTP uses JSON-RPC over POST; SSE opens an event stream and POSTs requests back to the endpoint.
- The default dynamic ToolRegistry loader uses the same V2 session path for stdio, HTTP, and SSE servers.
- Permissions are enforced per server and per tool with `allowedTools`, `deniedTools`, `enabled`, and `trustLevel`. Deny rules win over allow rules. Low-trust servers block risky write-like tools by default.
- Tool risk is inferred from names: `list`, `get`, `read`, and `search` are read-like; `create`, `update`, `delete`, `send`, `post`, `comment`, `merge`, `deploy`, and `publish` are high-risk write-like actions.
- OAuth support includes token status/logout plumbing, mocked refresh/device-flow helpers, and a local token store with `0600` file permissions when no secure store is configured. Token values are never printed.
- Headers and env values that look like credentials are redacted in summaries and diagnostics.
- Tool output is capped by `outputTokenLimit` where configured.
- Tool failures are surfaced as MCP tool errors instead of being silently treated as successful results.
- Stderr from the server is retained in diagnostics and test output to make failures debuggable.

## Current Limitations

- OAuth device login still depends on server-provided metadata. The CLI reports safe status and logout today, while full interactive browser/device login remains intentionally conservative.
- SSE reconnect behavior is bounded and suitable for mocked/default use, but advanced production reconnect backoff is still lighter than hosted IDE MCP clients.
