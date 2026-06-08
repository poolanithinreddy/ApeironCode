# Review Cockpit

Phase 17 mounts the review cockpit inside the live TUI dashboard flow for slash-driven review.

```bash
apeironcode team cockpit <teamRunId>
apeironcode team review <teamRunId> --interactive
```

The cockpit has panes for overview, artifacts, conflicts, memory suggestions, merge plan, events, and actions. In the TUI, `/team cockpit <id>` and `/team review <id> interactive` open a mounted Ink panel with keyboard routing. The CLI command still prints a command-driven static view for scriptability.

Supported keys in the reducer:

- `Left` / `Right`: switch panes
- `Up` / `Down`: move selection
- `Enter`: open/select
- `a`: apply safe action
- `r`: reject/skip
- `d`: discard
- `e`: export
- `m`: jump to merge plan
- `c`: jump to conflicts
- `g`: jump to memory suggestions
- `?`: help
- `q`: close/back

Cockpit actions call the same local services used by CLI commands: artifact open/export, memory approve/reject, conflict skip/manual marking, patch export/validation, and merge-apply previews. Destructive actions still require explicit approval outside the cockpit.

Phase 20 improves the daily-use feel of those actions:

- Action results render as an in-panel success/warning/error banner.
- The cockpit reloads team-run, workspace, merge-plan, and memory-suggestion state after each action.
- Memory approve/reject, conflict skip/manual marking, artifact export, patch export, and patch validation should be visible immediately after the action completes.
- Failed actions remain in the cockpit with an error banner instead of only appending a chat message.

Limits remain explicit: no OS sandboxing, no isolated provider credentials, no cloud/distributed execution, no parallel editing, and no semantic rename engine.
