# History

> **Brand note (Phase 15A):** ApeironCode was formerly developed and shipped as
> *ApeironCode Agent*. The legacy `apeironcode` CLI binary, `.apeironcode-agent/`
> project directory, `.apeironcodeignore` ignore file, and `OPENCODE_*`
> environment variables are all preserved as backward-compatible aliases.
> New projects use the `apeironcode` binary, `.apeironcode-agent/` directory,
> `.apeironcodeignore`, and `APEIRONCODE_*` environment variables. Storage
> paths below show the legacy on-disk names that remain the default.

ApeironCode now persists and searches several kinds of local history:

- saved sessions
- session-learning summaries
- persistent task plans
- project edit history
- project and global memory

## Storage Locations

- Sessions:
  `~/.apeironcode-agent/sessions/<session-id>.json`

- Transcripts:
  `~/.apeironcode-agent/transcripts/<session-id>.json`

- Project task plans:
  `.apeironcode-agent/tasks/<task-id>.json`

- Project edit history:
  `.apeironcode-agent/history/edits.jsonl`

- Edit backups:
  `.apeironcode-agent/history/backups/`

## Commands

Browse history:

```bash
apeironcode history
apeironcode history --all
apeironcode history --session <session-id>
apeironcode history --file src/example.ts
```

Search all persisted surfaces:

```bash
apeironcode search "provider setup"
apeironcode search "retry strategy" --scope session
apeironcode search "patch failure" --scope edit
apeironcode search "memory suggestions" --scope memory --all
```

TUI:

```text
/history
/history --all --limit 20
/search provider setup --scope task
/search retry strategy --all
```

## Search Scopes

`apeironcode search` and `/search` support these scopes:

- `all`
- `session`
- `task`
- `edit`
- `memory`

Results include:

- a kind label
- a title
- a short snippet
- an action hint such as `apeironcode sessions resume <id>` or `apeironcode revert <edit-id>`

The TUI renders these results in the search dashboard via `SearchViewer`.

## Session Browser Behavior

Saved sessions now include structured summaries from the run itself, such as decisions made, failed attempts, follow-up tasks, and memory load reasons. That makes the session store useful as both a resume target and a searchable local history source.

## Limitations

- Search is text-based and local only.
- Edit history is project-scoped; session history is stored globally and filtered by project path when requested.
- Search results are summary-oriented rather than full transcript excerpts.