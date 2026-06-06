# Phase 13 Plan

Date: 2026-05-01

## Current Team Execution

- `team run` builds a sequential planner -> coder -> tester -> reviewer plan.
- Each subagent runs through `Agent.run` in the same process and currently uses the main workspace root.
- Results are merged into a single summary and team events are written to `.apeironcode-agent/teams/events.jsonl`.
- Memory suggestions are queued after team runs.

## Current Scoping And Locks

- Subagent tool scopes are enforced by `ToolRegistry.setAllowedTools()`.
- Edit/write/patch/revert tools are also guarded by tool-lock extraction and multisession file locks.
- Locks apply inside the active tool executor workspace root; before Phase 13 this was always the main project root.

## Missing Isolation

- Subagents do not yet receive isolated workspace roots.
- There is no persistent workspace manifest, diff collection, merge plan, discard flow, or apply gate.
- Git worktree support is not safe to assume in every project, so temp-copy isolation is the reliable first runtime target.

## Current Workflows

- `workflow list` uses a flat catalog.
- `workflow run` now calls `Agent.run`, but recipes are not typed and reports are not persisted as first-class workflow run records.

## Current Memory Review

- Memory suggestions are stored in `.apeironcode-agent/memory/suggestions.jsonl`.
- CLI and slash commands can list, approve, and reject.
- There is no dedicated review viewer component yet.

## Phase 13 Implementation

- Add temp-copy subagent workspace creation, manifest persistence, diff collection, merge plans, discard, and approval-gated apply.
- Add explicit subagent policies with allowed/denied tools and role capabilities.
- Add typed workflow recipe registry, dry-run formatting, runtime reports, and report lookup.
- Add a memory review view model/component for pending suggestion review.
- Add shared approval review formatting for GitHub, memory, hook, and merge apply previews.
- Wire CLI routes and tests for the new runtime surfaces.

## Out Of Scope

- Parallel subagent execution.
- Fully automated git-worktree creation in non-test user repositories.
- Applying complex binary or rename patches.
- Cloud/distributed execution.
- Bidirectional live attach.

## Completed In This Sprint

- `team run --workspace temp-copy` now gives each subagent an isolated temporary copy and records workspace metadata.
- `team workspaces`, `team merge-plan`, `team apply`, `team discard`, and `team workspace cleanup` are wired in CLI; slash routes cover workspaces, merge-plan, apply, and discard.
- `git-worktree` mode is intentionally planning-only and refused for non-dry-run execution.
- Subagent policies are explicit and enforced through scoped tool registries.
- Workflow commands now use typed recipes, dry-runs, persisted reports, and runtime execution.
- Memory review and approval review have TUI components/view models with focused tests.
