# Memory

ApeironCode Agent now uses three memory layers:

- Project memory
  Stored in `.apeironcode-agent/memory.md` inside the current repository.

- Global memory
  Stored in `~/.apeironcode-agent/memory/global.md`.

- Session learning
  Stored inside each saved session record under `~/.apeironcode-agent/sessions/<session-id>.json`.

## Project and Global Memory

Project memory is for repository-specific facts such as:

- important files
- build, lint, and test commands
- architecture notes
- recurring pitfalls
- local conventions

Global memory is for user-wide preferences such as:

- coding style
- preferred providers or models
- explanation style
- test strategy

Sensitive-looking content is filtered before memory is persisted. Secret-like text and sensitive file paths are intentionally excluded from extracted memory.

## Session Learning

Each run can now persist a structured session-learning summary with:

- files inspected
- files modified
- commands run
- tests run
- decisions made
- failed attempts
- follow-up tasks
- memory suggestions
- memory load reasons
- final result summary

That session learning feeds the searchable history browser and helps explain why memory was loaded on later runs.

## Commands

CLI:

```bash
apeironcode memory show
apeironcode memory show --global
apeironcode memory summarize
apeironcode memory search "provider setup"
apeironcode memory why
apeironcode memory suggestions
apeironcode memory review
apeironcode memory review --status pending
apeironcode memory review --confidence high
apeironcode memory review --source team
apeironcode memory review --team <teamRunId>
apeironcode memory suggestion show <id>
apeironcode memory approve <id>
apeironcode memory reject <id>
apeironcode memory approve --all
apeironcode memory conflicts
apeironcode memory stale
apeironcode memory source <id>
apeironcode memory rollback <id>
apeironcode memory rollback <id> --yes
apeironcode memory forget-session <sessionId>
apeironcode memory forget-session <sessionId> --yes
```

TUI:

```text
/memory show
/memory add <text>
/memory edit <text>
/memory clear
/memory search <query>
/memory why
/memory suggestions
/memory review
/memory review pending
/memory suggestion show <id>
/memory approve <id>
/memory reject <id>
/memory conflicts
/memory stale
/memory source <id>
/memory rollback <id> --yes
/memory forget-session <sessionId> --yes
```

Notes:

- CLI `memory edit` is still a placeholder.
- The TUI already supports inline add and replace flows for project memory.
- Destructive graph controls preview by default. `rollback` and `forget-session` require `--yes` before they remove entities or edges.

## Search and Explainability

- `apeironcode memory search <query>` searches project memory, global memory, and session-derived learning.
- `apeironcode memory why` explains why project memory and global memory were loaded for the latest run.
- `apeironcode memory source <id>` shows where a graph entity, graph edge, or suggestion came from.
- `apeironcode memory conflicts` and `apeironcode memory stale` show review findings from the durable graph.
- `/memory search` renders results into the TUI search dashboard.

## Autosave and Suggestions

Config:

```json
{
  "memory": {
    "autoSave": false,
    "autoSuggest": true
  }
}
```

- `autoSuggest`
  Allows the runtime to produce categorized memory suggestions such as `architecture`, `command`, `file`, `pitfall`, or `preference`.

- `autoSave`
  Controls whether memory should be saved automatically. The default remains conservative.

Runtime suggestions are stored in `.apeironcode-agent/memory/suggestions.jsonl`.

- Agent, skill, and team runs create redacted suggestions after completion.
- Pending suggestions can be reviewed before they update the durable memory graph.
- Approved suggestions are applied to `.apeironcode-agent/memory/graph.json`.
- Rejected suggestions remain recorded but are not applied.
- The TUI home dashboard shows pending suggestion count and the latest suggestion summary.
- `MemoryReviewViewer` renders pending suggestions with confidence, source, related files, proposed facts, redaction state, and approve/reject hints.
- `memory review` and `/memory review` now include both durable graph review output and filtered memory suggestion review text. `--team <teamRunId>` narrows suggestions related to a team run.

Rollback behavior is intentionally conservative:

- Rolling back an entity removes that entity and its connected edges.
- Rolling back an edge removes only the edge.
- Forgetting a session removes graph facts whose metadata, tags, observations, or endpoints reference the session id.
- This is not a full versioned memory database. Use the preview text before `--yes`.

## Limitations

- Memory is summary-oriented, not a full transcript store.
- Secret-like content is dropped rather than transformed into partially visible summaries.
- Search is text-based over persisted summaries, not vector retrieval.
