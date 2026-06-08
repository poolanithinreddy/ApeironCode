# ApeironCode IDE Bridge Protocol

The IDE Bridge Protocol is a local, typed, authenticated message channel between the ApeironCode core engine and future IDE integrations (VS Code, JetBrains, desktop, web UIs).

## Overview

- **Local-only**: bridge server binds only to `127.0.0.1` in all phases.
- **Auth required**: every connection must authenticate with a workspace secret token before sending non-lifecycle messages.
- **Typed messages**: all messages use a strict `BridgeMessage` envelope with a known `type` string.
- **Sanitized payloads**: secrets are redacted before any message is sent to bridge clients.
- **No remote/cloud**: remote bridge access is not provided in Phase 16E and is not planned without explicit opt-in.

## Architecture

```
ApeironCode Core Engine
    │
    ├── EventBus  ──► BridgeEventAdapter ──► BridgeServer ──► IDE Client
    ├── TaskRunner ──► BridgeMessage
    ├── Agent loop
    └── ToolRegistry
```

The bridge server receives agent events via `attachBridgeToEventBus()` and broadcasts them to connected IDE clients as sanitized bridge messages.

## Message Types

| Category      | Types |
|---------------|-------|
| Lifecycle     | `bridge.hello`, `bridge.ready`, `bridge.ping`, `bridge.pong`, `bridge.error`, `bridge.closed` |
| Session       | `session.created`, `session.updated`, `session.message`, `session.completed`, `session.get_state` |
| Agent         | `agent.started`, `agent.progress`, `agent.completed`, `agent.failed` |
| Tool          | `tool.started`, `tool.output`, `tool.completed`, `tool.failed`, `tool.batch_summary` |
| Permission    | `permission.requested`, `permission.approved`, `permission.denied` |
| Task          | `task.created`, `task.updated`, `task.completed`, `task.failed`, `task.list`, `task.get` |
| Worktree      | `worktree.created`, `worktree.updated`, `worktree.removed` |
| Checkpoint    | `checkpoint.created`, `checkpoint.restored`, `runtime.state`, `runtime.get_state`, `checkpoint.list` |
| Context       | `context.view`, `context.compaction`, `context.delta` |
| Diff          | `diff.preview`, `diff.apply_requested`, `diff.apply_result` |
| Provider      | `provider.list`, `provider.get_active`, `provider.set_session_model`, `provider.session_model` |
| Terminal      | `terminal.output`, `terminal.exit` |

## Message Envelope

```typescript
interface BridgeMessage {
  id: string;           // UUID
  type: BridgeMessageType;
  timestamp: string;    // ISO 8601
  sessionId?: string;
  requestId?: string;   // for request/response correlation
  payload: Record<string, unknown>;  // JSON-serializable only
}
```

## Auth / Workspace Secret

The bridge uses a local per-workspace token stored under `.apeironcode-agent/bridge-secret.json`. The token file has restricted permissions (`0600`).

**CLI commands:**
```bash
apeironcode bridge token              # shows fingerprint only
apeironcode bridge token --show       # shows full token (keep secure)
apeironcode bridge status             # shows running state, connections
apeironcode bridge start              # starts local WebSocket bridge server
apeironcode bridge stop               # stops bridge server
```

**Phase 16F:** `bridge start` now starts a real local WebSocket server on `ws://127.0.0.1:<port>`. The port is ephemeral by default (OS-assigned). Pass `--port <n>` to specify a fixed port.

The token fingerprint (first 12 hex chars of SHA-256) is safe to share for verification. Never share the full token.

## Connection Flow

1. Client connects to bridge transport
2. Client sends `bridge.hello` with `{ token: "<workspace-token>" }`
3. Server validates token using timing-safe comparison
4. On success, server sends `bridge.ready`
5. Client may now send any message type

## Event Streaming

The `attachBridgeToEventBus()` adapter subscribes to all `AgentEvent`s and broadcasts mapped bridge messages:

```typescript
const unsubscribe = attachBridgeToEventBus(eventBus, bridgeServer);
// later:
detachBridgeFromEventBus(unsubscribe);
```

## Permission Flow

Bridge clients can receive permission requests and resolve them:

1. Core emits `permission.requested` bridge message
2. Client sends `permission.approved` or `permission.denied`
3. If no response within timeout (default 30s), decision is `timeout` (= deny)

See `src/bridge/permissions.ts` for `waitForBridgePermissionDecision()`.

## Diff Preview

The diff preview system produces safe summaries of file changes:

```typescript
const msg = createDiffPreviewMessage(unifiedDiff);
// msg.payload: { files, totalAdditions, totalDeletions, patchPreview, riskyPaths }
```

Protected paths (`.env`, `.git/`, private keys) are flagged as `risky: true`.

## WebSocket Transport (Phase 16F)

`WebSocketTransport` in `src/bridge/transport/webSocket.ts` provides:

- Binds only to `127.0.0.1` — never exposed publicly
- Auth required: `bridge.hello` with workspace token
- Ping/pong keepalive (30s interval)
- Max message size: 512 KB
- JSON bridge message protocol
- Secrets sanitized on all outgoing messages

Connect via: `ws://127.0.0.1:<port>`

## VS Code Extension (Phase 16F)

The extension at `extensions/vscode/` provides:

- Sidebar chat panel streaming bridge events
- Bridge connection management (start/stop)
- Permission approve/deny UI
- Diff preview with risky-path warnings
- Task and worktree status view
- Context view (files, token budget, provider)
- Selected file/range context capture

See `docs/vscode-extension.md` for setup.

## Known Limitations (Phase 16F)

- No remote/cloud bridge (local-only is intentional and enforced).
- `diff.apply_requested` / `diff.apply_result` not connected to tool path (auto-apply disabled in MVP).
- Prompt submission from VS Code webview pending bridge command routing.
- No JetBrains or other IDE extension yet.
- No VS Code Marketplace release yet.
