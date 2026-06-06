# Phase 16 Plan

## Current Review UI Capabilities

- `team review` is a command-driven summary for one team run.
- `team artifacts` groups artifacts by type and `team artifact` previews one artifact with redaction/truncation.
- `team conflicts` prints conflict details and supports JSON output.
- `memory review` supports status/confidence/source filters.

## Current Merge And Rename Limits

- Merge planning compares base snapshot, isolated workspace, and current main workspace.
- Rename detection is heuristic/hash/text based.
- There is no semantic rename/refactor engine.
- Apply remains approval-gated and conflict-averse.

## Current Workspace Pollution Issue

Team workspace diffs can include generated temp/cache files when tool execution writes project-local home/cache data. Diff collection has built-in ignores, but it does not yet load `.gitignore`/`.apeironcodeignore` or report ignored files for review.

## Implementation Plan

1. Add a review cockpit state machine, keyboard reducer, view model, and Ink component.
2. Wire `team cockpit <id>` and `team review <id> --interactive` to a rich command-driven cockpit view.
3. Upgrade artifact browsing with filter/search/preview metadata.
4. Add team-filtered memory review and cockpit memory pane.
5. Add merge resolution state for skip/manual/apply markers and patch export.
6. Add workspace ignore hygiene from built-ins, `.gitignore`, and `.apeironcodeignore`; surface ignored files.
7. Add security status/limits commands and slash output.

## Out Of Scope

- No OS sandboxing.
- No isolated provider credentials.
- No cloud/distributed execution.
- No semantic rename/refactor engine.
- No parallel editing.
- Full arrow-key TUI navigation may be represented by tested state/reducer and component wiring rather than a complete app-level modal router.
