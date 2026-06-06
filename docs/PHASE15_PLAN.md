# Phase 15 Plan

Date: 2026-05-01

## Current Conflict Review UX

- `team conflicts` prints conflict report text.
- `ConflictReviewViewer` and `conflictReviewViewModel` show basic file/type/reason/action hints.
- Conflict output is command-driven, not arrow-key navigable.

## Current Artifact Browser UX

- Team artifacts are persisted under `.apeironcode-agent/team-runs/<teamRunId>/`.
- CLI can list runs, show a run, list artifacts, print one artifact, and export a text summary.
- There is no grouped artifact browser view model yet.

## Current Memory Review UX

- `memory review` combines graph review and suggestion text.
- `MemoryReviewViewer` renders pending suggestions.
- Filtering exists at the view-model level only for status/confidence.

## Current Merge Engine Capabilities

- Base snapshots support base vs isolated vs current-main comparison.
- Conflicts cover binary, deleted, main-changed, and conservative same-line cases.
- Rename/move detection is not implemented.

## Current Team Parallelism Capabilities

- Team execution is sequential.
- Policies identify edit/command/network capability, but there is no `parallelSafe` flag.
- No parallel editing exists.

## Phase 15 Implementation

- Add TeamReview and ArtifactBrowser view models/components with grouped artifacts, safe truncation, secret redaction, and command hints.
- Extend MemoryReview view model/component with status, confidence, and source filters plus safe fact truncation.
- Improve conflict review with risk, base/main/isolated status, file-scoped hints, and JSON CLI option.
- Add rename-aware merge detection using deleted+added hash/similarity heuristics, with apply support for clean renames and rename conflicts.
- Add read-only parallel lane scheduling for policy-safe non-editing roles. Editing lanes remain sequential.
- Add explicit doctor/runtime security limit reporting for OS sandboxing, per-subagent credentials, and cloud/distributed execution.

## Out Of Scope

- Parallel editing.
- OS-level sandboxing.
- Isolated credentials per subagent.
- Cloud/distributed execution.
- Full semantic merge or rename conflict auto-resolution.
- Arrow-key navigation if the current TUI routing does not support it cleanly.
