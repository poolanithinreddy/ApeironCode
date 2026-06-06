# Security Model

ApeironCode uses a layered security model to protect users from accidental or
malicious misuse.

## VS Code extension (Phase 16F)

- The extension talks only to the **local WebSocket bridge** on `127.0.0.1` with a workspace token; it does not ship API keys or call providers directly.
- Model selection is stored per **bridge connection** (`provider.set_session_model`) and merged into the next `session.send_prompt` as `providerName` / `model` overrides for the CLI agent runner (still subject to CLI config and credentials on the host).
- Approved diff applies from the bridge use **ToolRegistry** (`patch_file`) with structured `patchOperations`; there is no parallel write path that bypasses tools.

## Project Trust

All project-level workflow definitions (agents, skills, commands) require **project
trust** to auto-load. Trust is stored in `~/.apeironcode-agent/project-trust.json`.

```bash
apeironcode trust           # trust the current project
apeironcode doctor          # check trust status and workflow registry
```

Temporary directories are **always untrusted** regardless of explicit trust grants.

## Project Brain

Project Brain is optional and uses `.apeironcode/` files. ApeironCode only creates those files after explicit approval (`apeironcode brain init --yes` or a VS Code confirmation). Plan mode writes nothing.

Safe summaries can be shown in untrusted projects, but behavior-changing `.apeironcode/agents`, `.apeironcode/skills`, and `.apeironcode/commands` still follow the workflow trust model. Scripts from `.apeironcode/` are not executed.

## Workflow Trust Tiers

| Source | Trust required |
|---|---|
| Builtin definitions | Always allowed |
| Global definitions | Always allowed (managed by the user) |
| Project definitions | Requires trusted project |
| Project commands with `requiresTrust: true` | Requires trusted project |

## Background Task Safety (Phase 16D)

| Guarantee | Detail |
|-----------|--------|
| No daemon | Tasks run synchronously in-process, no uncontrolled background process |
| No auto-cleanup | Worktrees are never deleted automatically |
| Path constraints | Worktrees always created/removed under `.apeironcode-agent/worktrees/` |
| Main tree protected | Worktree operations never modify the main git working tree |
| Secret redaction | Task prompts, logs, and output summaries are redacted before storage |
| Explicit removal | `worktree remove` requires `--yes` flag |
| Trust enforced | Tasks created with `--agent <name>` or `--command <name>` respect project trust |

## What is never executed

- **Scripts** listed in `scripts:` frontmatter (Phase 16C).
- **Scripts or arbitrary commands** stored in `.apeironcode/` Project Brain files.
- **References** listed in `references:` frontmatter (not auto-injected).
- **Shell commands** from command body (only `{{args}}` substitution).
- **Template engines** or `eval` in frontmatter or command bodies.

## Tool restrictions

- `allowedTools` specifies the whitelist for a workflow.
- `disallowedTools` overrides `allowedTools` (highest priority).
- Unknown tool names produce warnings but do not block loading.
- Tool execution still goes through `ToolRegistry` and the safety permission engine.

## Secret protection

- Secrets are redacted from formatted skill output.
- Secrets are redacted from rendered command prompts.
- Frontmatter parse errors never include raw values.

## Permission modes

Workflows can specify a `permissionMode`:
- `strict` — ask on all writes/shell, deny destructive (recommended for project agents).
- `inherit` — inherit the session's permission mode (default for commands).
- All other modes from the permission matrix are supported.

## Doctor checks

`apeironcode doctor` reports:
- Workflow directories present/missing.
- Project trust status.
- Number of blocked untrusted workflows.
- Workflow registry load summary.

## Approval-First Brain Writes (Phase 16G.2)

All Project Brain write operations use an **approval-first** model:

| Operation | Requirement |
|---|---|
| `brain init` | `--yes` flag (CLI) or VS Code confirmation dialog |
| `brain sync` / `brain sync-preview apply` | `--yes` flag (CLI) or VS Code confirmation dialog |
| `brain previews apply <id>` | `--yes` flag (CLI) or VS Code confirmation dialog |
| VS Code "Initialize Project Brain from Plan" | Modal VS Code confirmation dialog required |
| VS Code "Apply this Preview" | Modal VS Code confirmation dialog required |
| Orchestration plan display | Read-only. No files written. |
| Agent routing plan | Read-only. No files written. |
| Context preview | Read-only. No files written. |

There is **no silent creation** of `.apeironcode/` files. Plan and orchestration commands are read-only previews. The `approved:true` flag must be explicitly set before any write is accepted by the bridge handler.

VS Code webview panels enforce this by:
1. Showing a modal `vscode.window.showWarningMessage` with `{modal: true}` before sending any write request.
2. Only sending `brain.init` or `brain.preview_apply` with `approved: true` after the user clicks the confirmation button.
3. Never writing on button click alone — the confirmation step is mandatory.

## Runtime Brain Context Redaction (Phase 16H)

All Project Brain content that enters agent prompts, bridge messages, doctor output, or the VS Code webview is passed through `redactProjectBrainText()`:

- Tokens ≥ 32 characters matching `[A-Za-z0-9_-]{32,}` (secret-like patterns) are replaced with `[REDACTED]`.
- No raw file content from `.apeironcode/` appears in bridge payloads.
- The VS Code brain panel uses `escapeHtml()` on all dynamic values before rendering.
- Context injection text is capped at a configurable token budget (default 900 tokens).
- For simple prompts (≤ 6 words, no intent signal), brain context is skipped entirely — zero overhead and no file reads.

## Safety invariants preserved

- `ToolRegistry` is not bypassed.
- `provider.chat()` is not reintroduced.
- XML tool directives are not used.
- Memory 2.0, Context 2.0, Runtime 2.0, Token Efficiency 2.0, and Safety 2.0 are
  all preserved.
- No `.apeironcode/` directory is created silently.
