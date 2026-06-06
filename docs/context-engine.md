# Context Engine

ApeironCode Agent builds prompt context in layers so the model sees a compact summary of the workspace before it starts reading files or proposing edits.

The current context engine is spread across `src/context`, `src/agent/context.ts`, and `src/lsp/context.ts`.

## Pipeline

The runtime currently builds context in this order:

1. `scanProject()` inspects manifests, scripts, frameworks, source directories, and git status.
2. `buildProjectIndex()` walks the workspace with merged ignore rules and records per-file previews, imports, exports, and symbol hints.
3. `rankRelevantFiles()` scores indexed files against prompt keywords, changed paths, file kind, and source-directory heuristics.
4. `RepoMapManager.ensureFreshMap()` loads or refreshes the repository map and extracts important files.
5. `LspContextBuilder.buildSummary()` adds an honest code-intelligence summary describing LSP readiness or fallback mode.
6. Selected workflows request short-lived LSP document symbols and capped diagnostics for the top 1 to 2 relevant files.
7. Project memory is appended if available.
8. File summaries for the top relevant files are packed through the repo-brain context packer with a token budget.
9. Related memory-graph facts are searched by prompt and relevant path.
10. `buildSystemPrompt()` combines the context bundle with tools, mode guidance, workflow guidance, provider hints, packed repo context, and memory sections.

## What Goes Into Prompt Context

`src/agent/context.ts` currently includes these sections in the prompt context payload:

- working directory
- project summary
- package/project metadata
- project scan JSON summary
- project tree
- repository map highlights
- code-intelligence summary
- compact diagnostics context for selected workflows
- relevant file excerpts
- project memory
- repo-brain packed context and token budget report
- related memory-graph facts with selection rationale

This is the primary way ApeironCode becomes workspace-aware before any tool calls happen.

## Relevance Ranking

Relevant files are not chosen randomly. The current scoring system in `src/context/relevance.ts` boosts files when:

- the file path contains a prompt keyword
- a symbol name matches a prompt keyword
- an import matches a prompt keyword
- the file is in the current git diff
- the file lives under a detected source directory
- the prompt implies config, test, or doc work and the file kind matches that surface

The resulting list is then summarized and packed by `src/context/contextPacker.ts` so the prompt stays bounded. Final execution summaries now include a short context-selection line with selected chunks, estimated token savings, and memory facts used.

Useful commands:

```bash
apeironcode context index
apeironcode context budget
apeironcode context explain "fix tests"
apeironcode context why "fix tests"
```

## Repository Map

The repository map is a cached structural summary of the project. `RepoMapManager` refreshes it when:

- no map exists yet
- the cached map is older than 30 minutes
- file counts changed significantly
- tracked config files changed
- the caller forces a refresh

The map is used for:

- important-file hints in prompt context
- repo summary commands
- stale/fresh status in the TUI and repo-intelligence views

## Ignore Handling

Context building respects merged ignore patterns from:

- built-in defaults
- user/project config ignored paths
- `.apeironcodeignore`

That same ignore-aware behavior is important for both repo intelligence and prompt relevance so generated files, dependencies, and external folders do not overwhelm the model.

## Code Intelligence Layer

The context engine already includes a code-intelligence section, but it is important to separate two modes:

### LSP-ready mode

If a supported language server binary is installed, `src/lsp/context.ts` reports that LSP code intelligence is available. For `debug`, `fix`, `test-fix`, `review`, and `refactor`, `src/agent/context.ts` also requests short-lived diagnostics for the top 1 to 2 relevant files with a 3 second timeout per file.

### Fallback mode

If no supported server is installed, the prompt explicitly falls back to:

- regex-based symbol extraction
- grep-based definition search
- repository map and import analysis

When diagnostics cannot be collected live, the prompt and final summary say so explicitly with `source: fallback analysis` plus the fallback reason.

This fallback is currently what powers most code-understanding behavior in practice.

## Planning Mode

The project-context builder also creates a lightweight plan when the prompt looks like a real engineering task rather than small talk. That planning hint is currently triggered by prompt length and keywords such as `fix`, `debug`, `implement`, `review`, `test`, or `doctor`.

The plan is intentionally simple:

- confirm project shape and commands
- inspect the most relevant files first
- prefer read-only tools before edits
- validate with the narrowest available command after changes

This sits alongside the newer plan-management and approval-gate features rather than replacing them.

## Known Limits

The context engine is useful, but it is not equivalent to an editor index yet.

- file previews are capped and can miss deeper context in large files
- relevance scoring is heuristic, not semantic search over full AST data
- live diagnostics are file-scoped and depend on server publish behavior during a short request window
- definition and reference lookups are position-based and request-scoped rather than long-lived editor state
- the agent still relies on tool calls to gather deeper local evidence before editing

The practical result is that ApeironCode already has a real context engine, but it is still a hybrid of indexed repository intelligence and prompt-time heuristics rather than full IDE state replication.

## Phase 16B: Context Viewer & Compaction Explanation

Two diagnostic modules make context decisions auditable without leaking
file contents:

- `src/context/contextViewer.ts` builds a `ContextViewReport` that lists
  selected and omitted files, summarizes memory items (truncated, with
  secret redaction), and reports the active context mode (`delta`,
  `full`, `compressed`) plus token budget usage and exposed tool schemas.
  `formatContextViewReport` renders the report for CLI display and is
  guaranteed not to print raw file contents or secret-like values.
- `src/context/compactionExplain.ts` produces a `CompactionExplanation`
  that lists which items were preserved, summarized, and omitted during
  history compaction, with `tokensSaved` and a warning when items were
  dropped. `formatCompactionExplanation` renders a concise diff suitable
  for traces and the doctor output.

### Tool Batch Summaries (Phase 16B.1)

After each iteration of the agent loop, when the orchestrator has executed
a batch of three or more tool calls (or any batch under a tight token
budget), `summarizeToolBatch` and `formatToolBatchSummary` produce a
compact, redacted record of the tools run, files read/changed, commands
executed, and any failures. The summary is written to the debug log via
the structured logger; it is never injected back as an assistant message
and never contains raw tool output.

### `apeironcode context view`

The `context view` CLI subcommand renders the current `ContextViewReport`
through `formatContextViewReport`. When no live session has populated the
context, it prints a safe `Files selected: 0` placeholder. Memory items
shown by this command are always truncated and secret-redacted; raw file
contents are never displayed.
