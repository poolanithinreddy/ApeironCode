# Changelog

## Unreleased

### Fixed

- Zod → JSON Schema conversion now uses the maintained `zod-to-json-schema` library instead of reading Zod's unstable private `_def` internals; this also fixes tool schemas wrapped in `.refine(...)` (e.g. `revert_patch`) whose parameters were previously dropped.
- Declared the `@types/json-schema` types so `npm ci && npm run typecheck` works from a clean install.
- Replaced the hand-rolled AWS Bedrock SigV4 signer with the maintained `aws4` library for correct canonical requests, payload hashing, and header normalization. The Bedrock provider remains experimental and is not validated against live AWS.

### Changed

- `APEIRONCODE_TEST_OFFLINE` is now the preferred sandbox offline flag; `OPENCODE_TEST_OFFLINE` is kept as a deprecated legacy alias.
- Documentation now uses the `APEIRONCODE_AUTOMATION*` environment variables as the primary names (the `OPENCODE_AUTOMATION*` aliases remain deprecated).

### Added

- Runtime hook firing for sessions, planning, tool calls, edit/command/commit tools, memory suggestions, and skill runs, with redacted JSONL hook event logs.
- Scoped CLI skill execution through the normal agent runtime with declared tool allowlists, skill hooks, and memory/session recording.
- Repo-brain packed context and memory-graph facts now feed real agent prompts and final summaries.
- Agent runs update the durable memory graph with session, task, file, and skill relationships.
- Approval-gated GitHub issue and PR comment previews with env-only token handling.
- Query-aware `apeironcode context why`, `apeironcode memory why`, nested `apeironcode github issue comment`, and `apeironcode hook events`.
- Phase 12: sequential `team run` runtime execution with scoped subagents, team event logs, and merged summaries.
- Memory suggestion queue with review, approve, reject, approve-all, and reject-all commands.
- Slash skill runs now apply scoped tool allowlists in the active TUI runtime.
- GitHub issue and PR creation with redacted dry-run previews and approval-gated posting.
- Runtime-backed `workflow run` using the agent loop instead of only formatted plans.
- Dashboard view model now surfaces pending memory suggestion counts and `/commands` renders categorized/filterable command groups.
- Phase 13: temp-copy isolated subagent workspaces, workspace metadata, diff collection, merge-plan review, approval-gated apply/discard commands, and workspace cleanup.
- Strict subagent policies now distinguish planner/coder/tester/reviewer/docs/security/git roles with allowlists, denied tools, and role capability flags.
- Typed workflow runtime recipes now back `workflow list`, `workflow show`, `workflow run --dry-run`, runtime reports, and `/workflow` slash routes.
- Memory review TUI view model/component and richer dashboard summary for pending suggestions.
- Shared approval review formatter/panel for GitHub writes, TUI approvals, and team merge apply previews.
- Phase 13 demo scripts and fixtures for isolated teams, workflow runtime, memory review, and approval previews.
- Phase 14: real detached git-worktree team workspaces for clean git repositories, with safe `.apeironcode-agent/worktrees/` path checks and cleanup.
- Three-way merge review using base snapshots, conflict classification, binary-file skipping, file-scoped apply, and conflict reports.
- Team-run artifact browser with local plan, subagent output, diff, and summary artifacts under `.apeironcode-agent/team-runs/`.
- Memory review output now combines graph review with filtered suggestion review text.
- Conflict review view model/component and Phase 14 worktree/merge/team-artifact demo docs.
- Phase 15: command-driven `team review`, grouped/redacted artifact browser details, richer conflict review output, and filtered memory review surfaces.
- Rename-aware merge planning and apply support for clean text-file moves, with rename-source and rename-target conflict detection.
- Conservative `--parallel-readonly` team scheduler output for roles that cannot edit or run commands; editing lanes remain sequential.
- `apeironcode doctor` now explicitly reports OS sandboxing, per-subagent credential isolation, and cloud/distributed execution limits.
- Phase 15 demo scripts/docs for review UI, artifact browser, rename merge, and read-only lane planning.
- Phase 16: review cockpit state machine/view model/component with command-driven `team cockpit` and `team review --interactive` surfaces.
- Artifact browser filtering/search metadata, memory review team filtering, merge-resolution state, local patch export, and ignored-file reporting.
- Workspace diff hygiene now applies built-in ignore rules plus `.gitignore` and `.apeironcodeignore` before merge planning.
- `apeironcode security status` and `/security status` make sandbox, credential, cloud, parallel-editing, and semantic-rename limits explicit.
- Phase 17: `/team cockpit` and `/team review <id> interactive` now mount a live Ink review cockpit in the TUI dashboard flow.
- Cockpit key handling now routes pane jumps, artifact export/open, memory approve/reject, conflict skip/manual marking, patch export/validation, and approval-preview actions through shared review action handlers.
- `apeironcode team export-patch` now writes unified diff patches with sidecar JSON, supports file-scoped exports, excludes ignored/skipped/conflicted files by default, and records patch events.
- `apeironcode team validate-patch` validates exported team patches with `git apply --check` inside git repositories and structural validation outside git repositories.
- `apeironcode team apply` previews patch validation status and blocks failed validation unless explicitly forced.
- Phase 18 UX stabilization: `apeironcode setup`, `setup status`, and `setup reset --dry-run` now provide a first-run path with no-key mock, Ollama, and cloud-provider profiles.
- Dashboard view models now organize project, agent readiness, quick starts, code intelligence, work, integrations, safety, memory, and help into a more coherent control panel.
- `/commands` now has beginner/advanced modes, command categories, examples, and did-you-mean suggestions for unknown slash commands.
- Skill discovery now includes `apeironcode skill browser`, `apeironcode skill templates`, `apeironcode skill test`, `/skills`, `/skill browser`, and `/skill templates`.
- Added honest `apeironcode sandbox status` / `sandbox doctor` detection for optional sandbox backends without claiming OS sandboxed execution.
- Added mock-only `apeironcode eval list`, `eval run`, and `eval report` for local product-health checks.
- Phase 19 product stabilization: compact dashboard task summaries, category-aware `/commands team`, provider fallback failure simulation, GitHub PR summary/review and Actions/CI explanation commands, memory rollback/source/conflict controls, skill browser filter/search/trust toggles, and a built-CLI temp-HOME product flow test.
- Phase 20 TUI bug bash: slash command input now handles PTY newline submission more reliably, commands echo visibly in chat, command errors recover cleanly, the home dashboard is more compact, cockpit actions refresh the panel with result banners, and `demo:tui`/`demo:ux` make temp-HOME manual TUI checks easier.

- Phase 8: Real background worker execution with `apeironcode session start --background` spawning detached workers
- Internal `apeironcode session run-worker <sessionId>` command for worker process lifecycle
- Worker metadata storage: `workerPid`, `workerCommand`, `workerStartedAt`, `workerStatus` in session records
- Enhanced `session start --background` spawns detached process via ProcessManager and stores worker metadata
- Improved `session stop` checks worker PID and sends graceful SIGTERM if running
- Enhanced `session attach` shows worker PID and read-only limitation messaging
- Event types `worker_started` and `lock_released` for worker lifecycle tracking
- New method `MultiAgentSessionManager.storeWorkerMetadata()` for updating worker metadata
- 2 new background runner tests for worker metadata and events
- Honest messaging: background execution is process-local, no cloud service, no live interactive input

- Phase 7: Background session runner foundation with event logging, attach/logs CLI and slash commands, honest `--background` flag messaging
- Event log persistence: `.apeironcode-agent/sessions/logs/<sessionId>.jsonl` with append/read/tail/stream operations
- Event types: session_started, status_changed, tool_started, tool_completed, tool_failed, file_locked, file_changed, command_run, test_run, permission_decision, session_completed, session_failed, session_stopped
- Session event timeline in share/export (JSON, Markdown) with secret redaction
- Improved `apeironcode session stop <id>` with lock cleanup and status feedback
- `/session logs <id> [--tail 50]` and `/session attach <id>` with read-only event streams
- `apeironcode session logs <id>` and `apeironcode session attach <id>` CLI commands with event display
- Session LogStore for JSONL persistence, ProcessManager for local child process spawning (background mode not enabled yet), and BackgroundSessionRunner for lifecycle coordination
- 13 background runner tests covering event logs, process management, and stop/cancel behavior
- Honest documentation that background mode is not yet fully enabled, attach is read-only, and no cloud/distributed execution

- Phase 6B: Multi-agent sessions with process-local tracking, session lifecycle management (queued, running, paused, completed, failed, stopped), file change/command/test tracking, and agent session recording in tools
- Advisory file locks for preventing concurrent modifications to files by different agent sessions; locks enforced for `edit_file`, `write_file`, `patch_file`, and `revert_patch`
- Session export to Markdown, JSON, and HTML formats with automatic secret redaction; local-only storage in `.apeironcode-agent/shares/` with file:// URLs
- `apeironcode session list`, `apeironcode session start`, `apeironcode session show`, `apeironcode session stop`, `apeironcode session locks`, `apeironcode session attach` (summary view)
- `apeironcode share <id|latest>` with `--format markdown|json|html` support
- Multi-agent session integration into TUI dashboard showing running/queued/paused counts and active lock counts
- `/sessions`, `/session list`, `/session start`, `/session show`, `/session stop`, `/session locks`, `/session attach` slash commands
- `docs/sessions.md` and `docs/share.md` documenting session lifecycle, locks, limitations, and export formats
- 36 session behavior tests and 12 session export tests with comprehensive lifecycle, tracking, and lock coverage

- `docs/lsp.md` and `docs/context-engine.md` documenting the real code-intelligence pipeline, LSP readiness layer, and fallback behavior
- a thin framed JSON-RPC transport foundation under `src/lsp/transport.ts`
- `src/lsp/client.ts` with a short-lived live `documentSymbol` client path over the existing JSON-RPC transport
- live-or-fallback `apeironcode lsp symbols <file>` output with explicit source and fallback reason metadata
- `/lsp symbols <file>` in the TUI with the same live-or-fallback behavior
- document-symbol summaries for top relevant files in `debug`, `review`, and `refactor` project context
- short-lived live-or-fallback `apeironcode lsp diagnostics <file>`, `apeironcode lsp definition <file> <line> <character>`, and `apeironcode lsp references <file> <line> <character>` output
- `/lsp diagnostics`, `/lsp definition`, and `/lsp references` in the TUI with the same source and fallback reporting
- compact diagnostics summaries in agent prompt context and final execution summaries for `debug`, `fix`, `test-fix`, `review`, and `refactor`
- dedicated LSP diagnostics, definitions, references, and agent-context tests backed by the mock LSP server
- process-local long-lived LSP sessions with document lifecycle tracking, idle cleanup, and per-file cache invalidation
- `apeironcode lsp sessions`, `apeironcode lsp restart`, `apeironcode lsp stop`, `apeironcode lsp cache`, and `apeironcode lsp cache clear`
- `/lsp sessions`, `/lsp restart`, `/lsp stop`, `/lsp cache`, and `/lsp cache clear`
- doctor and TUI status surfaces for active LSP sessions and cache state

- explicit workflow modules for feature, debug, explain, review, refactor, commit, and test-fix routing
- `apeironcode repo`, `apeironcode repo map`, and `apeironcode repo symbols <query>`
- TUI home dashboard with workflow shortcuts, active task summary, and recent sessions
- pure UI smoke coverage for HomeDashboard, StatusBar, and ErrorPanel render models
- provider capability hints in prompt construction and doctor/provider UX output
- `apeironcode doctor` diagnostics with provider connectivity checks
- `apeironcode provider test`
- `mock` provider for deterministic development and tests
- relevance-ranked project context and planning mode
- session list/delete/resume flows
- project memory slash commands
- permission rule commands and runtime enforcement
- `glob` tool and upgraded file/grep/list tools
- deterministic `npm run bench:agent`
- event bus, transcript recorder, task-state model, and approval lifecycle events
- provider catalog, role-aware routing, fallback models, and usage cost estimation
- plugin manifest and MCP endpoint loader with `.apeironcode-agent/plugins` support
- slash command registry with `/lint`, `/build`, `/tools`, `/context`, `/status`, `/permissions`, and `/plugins`
- structured `patch_file` tool, command session tools, git inspection tools, and lint/build runners
- session search and richer compaction summary behavior
- `apeironcode mcp list`, `apeironcode mcp tools <server>`, and `apeironcode mcp test <server>`
- experimental managed MCP runtime with shared server lifecycle, diagnostics, and workflow coverage
- structured session-learning persistence with memory load reasons, failed attempts, and follow-up tasks
- searchable history across sessions, task plans, edit history, and memory
- `apeironcode search`, `apeironcode memory search`, and `apeironcode memory why`
- provider readiness and setup UX with `provider list`, `provider setup`, `provider doctor`, `model list`, and `model recommend`
- provider fallback chain UX with `apeironcode provider fallback [role]` and `/provider fallback [role]`
- Ollama local-first UX with `apeironcode ollama status`, `apeironcode ollama models`, `apeironcode ollama recommend`, and pull hints
- capability-aware tool-calling strategy helpers for native tools, JSON blocks, ApeironCode tool-call tags, and plain-text fallback
- provider fallback, tool-calling strategy, Ollama UX, and CLI command coverage
- built-in `web_fetch`, `web_search`, and `web_research` tools
- CLI and slash-command surfaces for web tools
- `Network(...)` permission enforcement for tool-declared outbound targets
- web safety coverage for protocol blocking, private-host blocking, query sanitization, and explicit network approvals
- TUI search viewer for history and memory results

### Changed

- architecture and LSP docs now describe the current LSP implementation honestly: readiness detection is stable, process-local long-lived sessions and cache are implemented, live requests can now surface `cached LSP`, and broader IDE-style workflows are still not implemented
- `apeironcode lsp symbols` and `/lsp symbols` try live `documentSymbol` first and preserve fallback behavior when live LSP is missing or fails
- `apeironcode lsp diagnostics`, `apeironcode lsp definition`, and `apeironcode lsp references` now report live-vs-fallback results instead of placeholder or ambiguous output
- the shared agent project context now enriches relevant workflows with capped diagnostics and reports diagnostics source, files checked, counts, and fallback reasons in final summaries
- agent loop now supports multi-tool turns, `<opencode_tool_call>`, and malformed tool-call retry prompts
- one-shot CLI preamble, final execution summary, session metadata, and TUI status now share the same effective-mode resolution
- slash workflow help now includes `/commands`, usage examples, and better missing-argument guidance
- approval prompts, provider diagnostics, slash output, and error panels now safely stringify unexpected structured values
- final responses now include execution summaries
- status bar now shows branch, approval mode, and session id hints
- status bar layout is now lower-noise and the empty-state TUI shows a home dashboard
- project scanning now uses indexed manifests, ignore handling, and richer relevance ranking
- session persistence now stores titles, goals, plans, task state, and transcript paths
- external tool loading now refreshes plugin and MCP tools in the active runtime, not only in list views
- MCP tool failures now surface as tool-call errors instead of soft success payloads
- model catalog and picker now expose richer provider readiness, capability, and price-tier metadata
- model recommendations now include local/cloud labels, setup-required notes, Ollama pull hints, and respect `localOnly`
- provider smoke output now includes provider, model, status, confidence, and latency when available
- multisession tests now use unique temporary directories to avoid parallel cleanup races
