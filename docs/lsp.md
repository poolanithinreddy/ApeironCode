# LSP and Code Intelligence

ApeironCode Agent has a narrow LSP layer with process-local long-lived sessions. It can detect local language servers, keep a small pool of JSON-RPC sessions alive while the current process is running, reuse opened documents across requests, cache file-scoped results, and fall back cleanly when a server is missing or a request fails. It is still not an IDE-grade workspace session.

## Stable Today

The repository can currently:

- detect whether a supported language-server binary is installed
- surface that availability in `apeironcode doctor` and `apeironcode lsp status`
- keep process-local long-lived sessions keyed by workspace, language, and server command
- track `didOpen`, `didChange`, and `didClose` document lifecycle events inside those sessions
- cache file-scoped `documentSymbol`, diagnostics, definition, and references results, and invalidate them after file edits
- run live requests for `textDocument/documentSymbol`, `textDocument/definition`, `textDocument/references`, and file-scoped diagnostics collection through `textDocument/publishDiagnostics`
- show explicit live-vs-cached-vs-fallback sources in the CLI and TUI for `symbols`, `diagnostics`, `definition`, and `references`
- inject code-intelligence status plus compact diagnostics into agent prompt context and final execution summaries for `debug`, `fix`, `test-fix`, `review`, and `refactor`
- cap prompt diagnostics to 10 items across at most 2 relevant files so LSP output cannot flood the model context
- keep working when no language server is installed

## Experimental Today

These surfaces are still intentionally limited:

- live diagnostics still depend on whether the server publishes `textDocument/publishDiagnostics` for the opened or changed file in time
- definition and reference lookups are position-based
- sessions are process-local only and do not survive across separate CLI invocations
- no workspace-wide diagnostics aggregation is implemented
- no rename, code actions, semantic tokens, call hierarchy, or IDE extension logic is implemented

## Current Architecture

The LSP layer lives in `src/lsp`.

- `detector.ts` checks whether a known language-server command is callable
- `manager.ts` caches per-language status, exposes session/cache state, and formats readiness reports
- `context.ts` builds the high-level code-intelligence summary used in prompts, summaries, and the TUI
- `transport.ts` provides framed stdio JSON-RPC request and notification handling
- `client.ts` remains the short-lived fallback path and exports the shared LSP response mappers
- `documentStore.ts` tracks open documents, versions, URIs, and content hashes for long-lived sessions
- `cache.ts` stores per-file LSP responses keyed by method, content hash, and server identity
- `session.ts` owns one live LSP process, document sync, notifications, session status, and cache writes
- `sessionManager.ts` reuses sessions across the current process and performs idle cleanup
- `symbols.ts`, `diagnostics.ts`, and `definitions.ts` prefer long-lived sessions first and fall back to the short-lived client path when needed
- `format.ts` formats status, source labels, session/cache summaries, diagnostics summaries, and fallback reasons for CLI, slash commands, and agent context

This keeps the implementation honest: LSP is a local code-intelligence assist layer, not a hidden remote dependency and not a claim of full IDE parity.

## Supported Languages

The built-in detector currently knows about these workspace languages and expected servers:

| Language | Expected server | Install hint |
| --- | --- | --- |
| TypeScript | `typescript-language-server` | `npm install -g typescript-language-server typescript` |
| JavaScript | `typescript-language-server` | `npm install -g typescript-language-server typescript` |
| Python | `pyright-langserver` | `npm install -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |
| Java | `jdtls` | Manual setup; detection only |

These mappings are hardcoded in `src/lsp/detector.ts`. If your project language is not in that list, `apeironcode lsp status` will report it as unsupported.

## User-Facing Surfaces

### `apeironcode doctor`

`apeironcode doctor` includes `LSP servers`, `Code intelligence`, `LSP sessions`, and `LSP cache` checks.

- `pass` means at least one supported server was found
- `warn` means no supported server was found for the known language list

This proves readiness, not that every live request will succeed.

### `apeironcode lsp status`

`apeironcode lsp status` prints one line per supported language, for example:

```text
TypeScript: available via typescript-language-server
Python: missing, install with npm install -g pyright
```

### `apeironcode lsp sessions`, `restart`, `stop`, and `cache`

- `apeironcode lsp sessions` prints the active long-lived session snapshots for the current process
- `apeironcode lsp restart` and `apeironcode lsp stop` operate on the current process-local sessions only
- `apeironcode lsp cache` prints aggregate cache counters and method breakdowns
- `apeironcode lsp cache clear` clears the current process-local cache

These are most useful in the TUI slash-command runtime or other long-lived ApeironCode processes. A fresh one-shot CLI invocation starts with no prior sessions.

### `apeironcode lsp symbols <file>`

- reports `source: live LSP` when a short-lived `documentSymbol` request succeeds
- reports `source: cached LSP` when the current process already has a valid cached answer for that file content
- reports `source: fallback index` when the live path is unavailable or fails
- includes a fallback reason when a live request was attempted

### `apeironcode lsp diagnostics <file>`

- reports `source: live LSP` when the server publishes diagnostics in time
- reports `source: cached LSP` when the current process already has a valid diagnostics result for that file content
- reports `source: fallback analysis` when no server is available or the live request times out or fails
- never crashes when a server is missing

### `apeironcode lsp definition <file> <line> <character>`

- reports `source: live LSP` when a short-lived definition lookup succeeds
- reports `source: cached LSP` when the current process already has a valid cached answer for that file content and position
- reports `source: fallback unavailable` with a reason when no live lookup is possible

### `apeironcode lsp references <file> <line> <character>`

- reports `source: live LSP` when a short-lived references lookup succeeds
- reports `source: cached LSP` when the current process already has a valid cached answer for that file content and position
- reports `source: fallback unavailable` with a reason when no live lookup is possible

### `/lsp ...`

The TUI exposes the same surfaces through:

- `/lsp symbols <file>`
- `/lsp diagnostics <file>`
- `/lsp definition <file> <line> <character>`
- `/lsp references <file> <line> <character>`
- `/lsp sessions [language]`
- `/lsp restart [language]`
- `/lsp stop [language]`
- `/lsp cache`
- `/lsp cache clear`

The slash commands use the same providers and the same explicit source labels as the CLI.

## Agent Integration

`src/agent/context.ts` builds code-intelligence context in layers:

1. readiness or fallback status from `LspContextBuilder`
2. document-symbol summaries for the top 1 to 2 relevant files in `debug`, `review`, and `refactor`
3. compact diagnostics for the top 1 to 2 relevant files in `debug`, `fix`, `test-fix`, `review`, and `refactor`

Prompt context now includes a compact diagnostics block such as:

```text
Code Intelligence:
LSP code intelligence is available:
- typescript-language-server

Diagnostics:
- Diagnostics source: live LSP
- Files checked: 2
- Diagnostics found: 3
- src/auth.ts:12:8 error TS2322 Type 'string' is not assignable to type 'number'
```

When live LSP is unavailable, the prompt and final summary preserve the fallback reason instead of pretending diagnostics exist. When long-lived sessions are enabled, those summaries also expose session counts and cache counters so the agent can report whether code intelligence came from a warm LSP runtime or from fallback logic.

## Privacy and Failure Model

- LSP is local-only. ApeironCode talks to a language-server process on the same machine.
- No code leaves the machine because of the LSP layer.
- Missing servers do not break the agent, the CLI, or the TUI.
- Fallback mode still relies on repository indexing, regex-based symbol hints, grep-style search, and the repo map.

## What Is Not Implemented

The current LSP implementation still does not provide:

- workspace-wide diagnostics collection
- rename or code-action workflows
- semantic tokens
- IDE extension logic

The honest description is:

> ApeironCode Agent is LSP-aware for readiness detection, process-local long-lived sessions, prompt context, live and cached document symbols, position lookups, and experimental live diagnostics collection, but it still relies on fallback repository intelligence for broader code understanding and it does not claim full IDE parity.