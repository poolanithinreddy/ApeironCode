# Phase 14 Plan

Date: 2026-05-01

## Current Temp-Copy Behavior

- `team run --workspace temp-copy` creates one temporary copy per subagent.
- Subagents receive the isolated `workspaceRoot`.
- Diffs are collected by comparing isolated files with the main workspace.
- The main workspace is untouched until `team apply`.

## Current Git-Worktree Status

- Phase 13 only produced safe command plans for `git-worktree`.
- Non-dry-run CLI execution intentionally refused `git-worktree`.
- No worktree was created or cleaned up at runtime.

## Current Merge Apply Behavior

- Apply is a reviewed copy/delete flow.
- It detects only basic missing-file conflicts.
- It does not preserve a base snapshot, detect main changes since isolation, or classify binary conflicts.

## Current Artifact And Report Surfaces

- Team events are written to `.apeironcode-agent/teams/events.jsonl`.
- Workflow reports are stored under `.apeironcode-agent/workflows/reports.json`.
- Team runs do not yet have a first-class artifact directory.

## Current Memory Review UX

- CLI and slash commands can list, approve, and reject suggestions.
- A memory review view model/component exists for pending suggestions.
- There is no filtered review screen for pending/approved/rejected states.

## Phase 14 Implementation Plan

- Implement real detached git worktree creation for git repositories with safe path checks and cleanup.
- Store workspace base snapshots so merge apply can compare base, isolated result, and current main.
- Replace copy/delete merge planning with a merge engine that classifies clean files, conflicts, skipped files, and binary files.
- Add conflict report formatting and CLI/slash conflict routes.
- Add a team-run artifact store and browser commands for plans, subagent outputs, summaries, diffs, merge plans, and conflict reports.
- Extend memory review view models with status/confidence filters and richer command hints.
- Add safe read-only parallel-lane planning metadata without parallel editing.

## Out Of Scope

- Parallel editing.
- OS-level sandboxing.
- Isolated provider credentials per subagent.
- Cloud/distributed execution.
- Full rename-aware or semantic merge resolution.
- Automatic conflict resolution without user review.
