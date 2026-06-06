# Phase 17 Plan

## Current State

- The review cockpit has a reducer, view model, and command-rendered surface through `team cockpit` and `/team cockpit`.
- The TUI is chat/dashboard driven. Slash commands can set dashboard views, but the cockpit is currently rendered as plain assistant text rather than a mounted Ink panel.
- The cockpit reducer supports pane movement, selection, help, open/apply/reject/discard/export/back actions, but actions are not wired to runtime services.
- Team artifacts, merge plans, conflict reports, memory suggestions, and resolution state are persisted under `.apeironcode-agent/`.
- `team export-patch` currently writes a human review artifact, not a standard unified diff and not something validated with `git apply --check`.
- Merge apply is approval-gated by approval mode and uses the merge planner directly.

## Phase 17 Implementation

- Mount a live cockpit dashboard view in the TUI for `/team cockpit <id>` and `/team review <id> interactive`.
- Add keyboard handling to the cockpit component for pane navigation, help, close, export, skip/reject, and apply-style actions.
- Add cockpit action handlers that call existing artifact, memory, merge-resolution, patch-export, patch-validation, and discard/apply services.
- Replace patch export with a unified-diff patch writer that excludes ignored/skipped/manual/conflicted files by default, writes sidecar JSON, and supports file-scoped exports.
- Add `team validate-patch <teamRunId> [patchPath]` using `git apply --check` inside git repos and structural validation outside git repos.
- Add apply confidence by showing patch validation in `team apply` approval previews and blocking failed validation unless an explicit force option exists.
- Write team events for cockpit, patch, merge, memory, and artifact review actions where practical.
- Add focused tests for cockpit state/actions, patch export/validation, sidecars, CLI routes, and slash-mounted cockpit dashboard views.

## Out Of Scope

- No OS sandboxing.
- No isolated provider credentials.
- No cloud or distributed execution.
- No parallel editing.
- No semantic rename/refactor engine.
- No claim that every exported patch is perfect for every git repository; validation status is shown honestly.
