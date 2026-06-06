# Phase 12 Plan

Date: 2026-05-01

## Already Wired

- Agent loop, provider routing, tool execution, approvals, patch history, task plans, sessions, background workers, LSP, repo-brain context packing, hooks, scoped CLI skills, GitHub reads/comments, memory graph updates, local share/export, and workflow catalog all have source implementation and tests.
- Hooks fire from session, plan, tool, edit, command, commit, memory, and skill lifecycle paths.
- CLI `skill run` executes through `Agent.run` with a scoped tool allowlist.
- Agent prompts include repo-brain packed context and related memory graph facts.

## Partial

- `team run` currently formats a plan instead of executing subagents.
- Slash `/skill run` uses the active TUI agent path and does not apply the CLI allowlist.
- Memory graph updates are useful but memory suggestions are not yet reviewable/approvable as first-class records.
- Dashboard and `/commands` are functional but not yet a premium product surface.
- GitHub write coverage has comments, but not issue/PR creation.
- Workflow runs still lean on formatted plans more than runtime execution.

## This Phase Will Implement

- Sequential team runner that executes built-in subagents through `Agent.run`, with per-agent tool allowlists, structured results, and team event logs.
- `team run --dry-run` plus real `team run` CLI wiring and slash access.
- Memory suggestion queue stored at `.apeironcode-agent/memory/suggestions.jsonl`, with list/show/approve/reject/approve-all/reject-all CLI and slash routes.
- Slash skill execution through a shared scoped skill runtime path.
- Dashboard memory suggestion count and richer command palette categorization/filtering.
- Approval-gated GitHub issue and PR creation with redacted preview and dry-run mode.
- Demo scripts and docs that prove runtime behavior without real API keys.

## Out Of Scope

- Parallel subagent editing and isolated worktrees.
- Cloud/distributed execution.
- Bidirectional live attach.
- Full GitHub project management beyond issue/PR create and comments.
- A complete graphical memory editor; Phase 12 adds reviewable CLI/slash/TUI text surfaces.
