# ApeironCode VS Code Extension

The ApeironCode VS Code Extension provides a local-first AI coding agent interface directly in VS Code.

## Public beta (VSIX)

This extension is distributed as a **`.vsix` file** for public beta testing. It is **not** published on the VS Code Marketplace yet. Install with **Extensions: Install from VSIX…** in VS Code, then follow setup below. You still need the **ApeironCode CLI** and a **local bridge** (`apeironcode bridge start`); the extension does not embed the agent engine.

### Quick start

1. Build or obtain `apeironcode-<version>.vsix` and install from VSIX.
2. In your project: `apeironcode bridge start` (listens on `127.0.0.1` only).
3. VS Code: **ApeironCode: Start Bridge Connection** and paste the token from `.apeironcode-agent/bridge-secret.json` (stored in workspace secrets; never logged in full).
4. **ApeironCode: Open Chat** — use **Clear Chat** in the webview or the command palette to reset local messages only.
5. **ApeironCode: Select Model / Provider** — updates workspace settings and forwards `provider.set_session_model` to the bridge for the next `session.send_prompt`.
6. **Send Selection to Chat** attaches editor context; risky edits require permission approval in the webview.
7. **Diff preview**: structured applies go through the bridge as `diff.apply_requested` with `patchOperations` (ToolRegistry / `patch_file`); raw unified diff text alone is not auto-applied.
8. **Project Brain**: use **ApeironCode: Plan Project Brain** to preview `.apeironcode/`; **Initialize Project Brain** asks before writing.

### Known limitations

- Marketplace listing and auto-updates are out of scope for this beta.
- Bridge is **local-only**; no hosted/cloud bridge in this build.
- JetBrains and remote bridge clients are not in scope.

## Architecture

```
VS Code Extension
  ├── BridgeClient (WebSocket, 127.0.0.1 only)
  │     └── connects via ws://127.0.0.1:<port>
  ├── Sidebar Chat WebviewPanel
  ├── Permission Request UI
  ├── Diff Preview Panel
  ├── Task/Worktree View
  ├── Context View
  └── Selection Context Capture
              │
              ▼
ApeironCode Core (CLI process)
  └── bridge start  ←→  BridgeServer + WebSocketTransport
```

## UI Overview

The extension uses the ApeironCode premium UI system: dark-mode-first surfaces, VS Code design tokens, compact cards, clear status text, and explicit permission controls. The chat panel includes a local-first welcome state, connection header, model summary, Project Brain status, selected context chip, tool timeline, error banners, and Clear Chat. See [ui-ux.md](./ui-ux.md) for the shared CLI/VS Code design notes.

## Setup

### Step 1: Start the bridge server

```bash
apeironcode bridge start
# Output:
# ApeironCode Bridge — local WebSocket server started.
# Endpoint: ws://127.0.0.1:51234
# Token fingerprint: abc123def456
# Token stored at: /your/project/.apeironcode-agent/bridge-secret.json
```

### Step 2: Connect the extension

1. In VS Code, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Run **ApeironCode: Start Bridge Connection**.
3. When prompted, paste the full token from `bridge-secret.json`.
4. The extension stores the token in VS Code workspace secrets.

### Step 3: Open the chat panel

Run **ApeironCode: Open Chat** from the Command Palette, or click the ApeironCode icon in the Activity Bar.

## Commands

| Command | Description |
|---|---|
| `ApeironCode: Open Chat` | Open the sidebar chat panel |
| `ApeironCode: Start Bridge Connection` | Connect to local bridge |
| `ApeironCode: Stop Bridge Connection` | Disconnect from bridge |
| `ApeironCode: Show Setup Guide` | First-run onboarding guide |
| `ApeironCode: Select Model / Provider` | Choose agent model |
| `ApeironCode: Show Context` | Show context summary |
| `ApeironCode: Show Tasks` | Show task/worktree status |
| `ApeironCode: Plan Project Brain` | Preview optional `.apeironcode/` Project Brain files |
| `ApeironCode: Initialize Project Brain` | Create Project Brain files after confirmation |
| `ApeironCode: Show Project Brain` | Show safe Project Brain summary |
| `ApeironCode: Continue Current Plan` | Send a continuation prompt using Project Brain context |
| `ApeironCode: Send Selection to Chat` | Inject selected text as context |
| `ApeironCode: Approve Permission` | Approve a pending permission request |
| `ApeironCode: Deny Permission` | Deny a pending permission request |
| `ApeironCode: Run Doctor` | Troubleshooting hints |

## Security Model

- Bridge binds **only** to `127.0.0.1`. Not exposed on LAN or internet.
- Auth token is stored in VS Code **workspace secrets** (not settings).
- Token **fingerprint** (first 12 chars) is shown in logs/UI. Full token never logged.
- All webview content is HTML-escaped and protected by a strict Content Security Policy.
- Diff apply: IDE sends `diff.apply_requested` with explicit approval and optional structured `patchOperations`. Execution uses **ToolRegistry** (`patch_file`); raw unified diff strings without structured operations are **not** auto-applied.

## Token / Fingerprint

The token fingerprint is a safe short identifier:

```bash
apeironcode bridge token
# Bridge token fingerprint: abc123def456
# Full token stored at: /project/.apeironcode-agent/bridge-secret.json
```

Share the **fingerprint** for verification. Never share the full token over chat, email, or logs.

## Prompt Submission (Phase 16F.1)

The VS Code chat panel now drives live ApeironCode agent sessions:

1. Type a prompt in the chat input and press **Send**.
2. The extension sends `session.send_prompt` to the bridge server.
3. The bridge creates or reuses an agent session and calls `Agent.run()`.
4. Assistant messages, tool events, and task events stream back to VS Code.
5. Permission requests appear as approve/deny cards.
6. Errors are shown safely (no raw secrets, no stack traces).

### Selected Context Attachment

When you send a prompt, the active editor selection is automatically attached:
- File path (workspace-relative)
- Language ID
- Line range
- Selected text (capped at 8,000 chars, secrets redacted)

A small note shows: `Context attached: src/foo.ts lines 10–20`.

If no selection, the prompt is sent without editor context.

### Bridge Auto-Discovery

The extension discovers the bridge endpoint automatically:

1. **VS Code setting**: `apeironcode.bridgeEndpoint` if configured.
2. **Connection file**: `.apeironcode-agent/bridge-connection.json` written by `bridge start`.
3. **Manual**: User is prompted if neither is available.

The connection file contains endpoint + fingerprint only — the full token is never written there.

## Bridge CLI Commands (Phase 16F.1)

```bash
# Start bridge — writes connection file at .apeironcode-agent/bridge-connection.json
apeironcode bridge start

# Check status — shows endpoint from connection file
apeironcode bridge status

# Show token fingerprint (never full token)
apeironcode bridge token

# Show full token (requires --show flag)
apeironcode bridge token --show

# Stop bridge — removes connection file
apeironcode bridge stop
```

## Project Brain Commands (Phase 16G.2)

| Command | Description |
|---|---|
| `ApeironCode: Open Project Brain Panel` | Open the full brain control center panel |
| `ApeironCode: Route Prompt to Brain` | Route a prompt to the best agents/skills |
| `ApeironCode: Preview Brain Context` | Preview token-efficient context selection |
| `ApeironCode: Build App Plan` | Generate a large app build plan |
| `ApeironCode: Orchestrate App Build` | Full orchestration: vision, stack, phases, agents |
| `ApeironCode: Show Saved Brain Previews` | Open Sync Previews panel |
| `ApeironCode: Audit Project Brain` | Run brain health audit |
| `ApeironCode: Sync Preview` | Preview a brain sync before writing |
| `ApeironCode: Apply Brain Sync` | Apply a sync preview (requires confirmation) |

### App Build Plan View

The **App Build Plan** panel shows a rich orchestration result:

- Product vision, assumptions, and up to 3 clarifying questions.
- Detected stack with technology tags.
- Architecture outline.
- Phased build plan with per-phase task lists.
- Suggested agents with role and reasoning.
- Suggested project skills.
- Verification plan, risk list, first 3 next actions.
- Token strategy for long builds.

Action buttons:

- **Initialize Project Brain from this Plan** — requires explicit VS Code confirmation dialog before writing anything.
- **Copy Plan** — copies the full plan text to clipboard.
- **Start First Task** — sends the first action to the agent session (requires connection).
- **Preview Brain Context** — opens context preview in Project Brain panel.

### Sync Previews View

The **Sync Previews** panel lists all saved sync previews:

- Shows preview ID, creation timestamp, target files, risk level, and stale warning.
- Stale previews (older than 7 days) are flagged with a warning banner.
- Secrets are redacted in the changes summary display.
- **Apply** requires an explicit VS Code confirmation modal. No writes without `approved:true`.
- High-risk previews show an extra warning in the confirmation dialog.

## Runtime Brain Intelligence (Phase 16H)

The Project Brain panel now includes a **Runtime Brain Intelligence** section:

| Button | Bridge message | What it does |
|---|---|---|
| **Preview Brain Runtime Decision** | `brain.runtime` | Classifies prompt intent, shows whether brain will be used, confidence %, brain files, agents, token estimate |
| **Explain Brain Context** | `brain.explain` | Full debug explanation of how context was selected for the prompt |

When the bridge returns a `brain.runtime` response with `useBrain=true`, an information notification appears:
> `Project Brain: debug-fix context injected (120 tokens)`

The **Brain Used / Brain Skipped** badge appears in the panel with:
- Intent label (e.g. "Debug / Fix", "Continuation", "App Build")
- Confidence percentage
- Token estimate
- List of selected brain files (up to 6)
- List of suggested agents/skills (up to 4)
- Full debug explanation (when brain.explain response arrives)

All content is HTML-escaped and protected by the webview CSP. No secrets appear in the panel output.

## Current MVP Features

- ✅ Sidebar chat with **real prompt submission** to live agent sessions
- ✅ Connection status indicator
- ✅ Bridge start/stop commands + connection file auto-discovery
- ✅ Selected file/range context attachment
- ✅ Permission request approve/deny cards
- ✅ Diff preview with risky-path warnings
- ✅ Task and worktree status
- ✅ Context view (files, token budget, model, runtime brain section)
- ✅ Tool event streaming (tool.started / tool.completed in chat)
- ✅ Session busy detection (rejects concurrent prompts cleanly)
- ✅ Project Brain control center panel with all brain actions
- ✅ App Build Plan rich view with phases, agents, skills, risks
- ✅ Sync Previews view with stale detection and secret redaction
- ✅ Runtime Brain Intelligence panel (intent, confidence, files, agents, tokens)

## VSIX Packaging + Beta Install (Phase 16F.2)

### Build and package the extension

```bash
cd extensions/vscode
npm install
npm run package
# Produces: apeironcode-0.1.0.vsix
```

Or from the project root:

```bash
npm run vscode:package
```

### Install from VSIX

```bash
code --install-extension apeironcode-0.1.0.vsix
```

Or via VS Code UI: **Extensions** → **…** → **Install from VSIX…**.

### Troubleshooting

| Problem | Solution |
|---|---|
| Bridge not found | Run `apeironcode bridge start` in project dir |
| Auth failed | Re-run **ApeironCode: Start Bridge Connection** |
| Port already in use | Run `apeironcode bridge stop` |
| CLI not found | Set `apeironcode.cli.path` setting |

### Bridge Auto-Start

Enable `apeironcode.bridge.autoStart: true` to automatically start the bridge when a trusted workspace is opened. Requires the CLI on PATH or configured via `apeironcode.cli.path`.

**Security**: auto-start is blocked in untrusted workspaces. Never exposes the token.

### Model Selection

Run **ApeironCode: Select Model / Provider** to choose a model from a quick-pick list. The selection is stored in workspace settings as `apeironcode.selectedModel` and used for new agent sessions.

When the bridge is connected, the extension requests the provider catalog. When disconnected, a safe static fallback list is shown.

## Production Hardening (Phase 16F.3)

### Live Provider / Model Catalog

The bridge now serves `provider.list` returning a safe catalog (no API keys, no env values):

```bash
# Response includes: provider id, label, kind, configured status, models with contextWindow/toolCalling/streaming
```

The VS Code model selector loads live catalog when connected; falls back to a static list when disconnected.

### Diff Apply Flow

`diff.apply_requested` messages are permission-gated:
- Non-approved requests return `approval_required`
- Risky paths (`.env`, `package.json`, `node_modules/`, etc.) flag explicitly
- Path traversal rejected
- Oversized patches rejected (>50,000 chars)
- Direct FS apply via bridge is staged (not auto-applied) — see Known Limitations

### Health Checklist

Run `ApeironCode: Show Setup` to see a 7-item health report:
- CLI path ✓/⚠
- Bridge endpoint ✓/⚠
- Bridge token ✓/✗
- Bridge connection ✓/✗
- Model selected ✓/⚠
- Workspace trusted ✓/⚠
- Extension version ✓

### Error Recovery

Each error type maps to a human-readable message with a command hint:
- `AUTH_FAILED` → Start Bridge
- `CONNECTION_REFUSED` → Show Setup
- `AGENT_FAILED` → Run Doctor
- `MODEL_UNAVAILABLE` → Select Model
- `SESSION_BUSY` → Open Chat
- (and 9 more error codes)

## Known Limitations

- **No auto-apply** of diffs via bridge — returns `unsupported` with guidance; apply manually or via CLI.
- **No JetBrains** or other IDE extension yet.
- **No Marketplace release** yet — install from VSIX only.
- **No remote/cloud** bridge — local-only by design.
- The bridge server runs for the lifetime of the CLI process that started it.
- `provider.list` catalog is read-only; no API key configuration from extension.

## Extension Location

Source: `extensions/vscode/`

```
extensions/vscode/
├── package.json          # VS Code extension manifest
├── tsconfig.json
├── CHANGELOG.md
├── .vscodeignore         # VSIX packaging exclusions
├── src/
│   ├── extension.ts      # activation entry point
│   ├── config.ts         # settings + secrets
│   ├── logger.ts         # safe logging (no token in logs)
│   ├── types.ts          # shared type interfaces
│   ├── bridge/
│   │   ├── client.ts     # BridgeClient (WebSocket)
│   │   ├── messages.ts   # message factories (incl. send_prompt)
│   │   ├── auth.ts       # token fingerprint helpers
│   │   ├── discovery.ts  # bridge endpoint auto-discovery
│   │   └── autoStart.ts  # bridge auto-start helper
│   ├── views/
│   │   ├── chatPanel.ts
│   │   ├── webviewHtml.ts  # incl. buildSetupHtml onboarding
│   │   └── messageStore.ts
│   ├── context/
│   │   ├── selection.ts
│   │   └── contextView.ts
│   ├── permissions/
│   │   ├── permissionStore.ts
│   │   └── permissionPanel.ts
│   ├── diff/
│   │   └── diffPreview.ts
│   ├── tasks/
│   │   └── taskView.ts
│   ├── status/
│   │   └── statusBar.ts  # bridge status bar item
│   └── model/
│       └── modelSelector.ts  # model/provider quick-pick
└── test/                 # Vitest tests (mock VS Code APIs)
```
