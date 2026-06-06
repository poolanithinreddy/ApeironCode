# Implementation Plan

Date: 2026-05-01

## 1. Systems That Are Real

- Agent loop, provider routing, tool registry, approvals, audit log, patch/edit/revert, task plans, session persistence, multi-session records, background workers, LSP context, plugin/MCP loading, web tools, history/search, and local share/export are runtime-backed and tested.
- Provider fallback already retries one configured fallback at runtime and records usage.
- Memory graph, skills, GitHub connector, hooks, agent teams, repo brain, and quality workflows have source modules, CLI/slash access, and focused tests from the previous sprint.

## 2. Foundation-Only Systems

- Hooks are registered and testable but are not fired by the real agent/tool lifecycle.
- Skills produce scoped run plans but do not execute through the agent runtime with a tool allowlist.
- Repo brain indexes and packs context but is not part of the actual system prompt.
- Memory graph can search/review/prune but is not retrieved before tasks or updated after tasks.
- GitHub writes are not approval-gated runtime actions yet.
- Teams and workflows plan work but mostly do not execute runtime work.

## 3. Systems Needing Runtime Wiring

- Hook firing in `Agent.run`, `Agent.invokeTool`, and `ToolRegistry.invoke`.
- Skill execution through `Agent.run` with scoped tools, skill events, and memory/session usage records.
- Repo-brain and memory graph context inside `buildProjectContext`.
- Fallback events in final summaries/session events.
- Team/workflow runners that invoke existing agent workflows rather than only formatting plans.

## 4. Commands That Exist But Do Not Do Enough

- `apeironcode skill run` currently prints a plan; it must run the agent.
- `apeironcode hooks` lists hooks; lifecycle events must be emitted during real runs.
- `apeironcode context why` reports index status; it should explain query selection.
- `apeironcode memory why` needs query-aware graph reasoning.
- `apeironcode team run` and `apeironcode workflow run` need runtime-backed execution.
- GitHub comment/create commands are absent and should be dry-run/approval-gated.

## 5. Weak UI/TUI Screens

- `/commands` is functional but not a premium categorized palette.
- Dashboard shows some session/lock state but not enough memory/skill/GitHub/hook readiness.
- Skills, memory graph, hooks, GitHub, teams, and workflows are slash text surfaces, not dedicated rich viewers.

## 6. Missing Tests

- Hooks firing around real tool calls and session completion/failure.
- Skill execution with allowlisted tools and blocked undeclared tools.
- Agent prompt includes repo-brain and memory graph context.
- Memory graph suggestions and session relationships after runs.
- Provider fallback summary/event assertions.
- GitHub write approval and dry-run behavior.
- Team/workflow runtime execution.

## 7. Highest-Impact Product Improvements

1. Runtime hook dispatcher with event logs.
2. Real skill execution with scoped tools.
3. Repo-brain and memory graph context in actual prompts.
4. Query-aware context/memory `why`.
5. Provider fallback events in final summaries.
6. Minimal runtime team/workflow execution on top of existing agent modes.
7. Approval-gated GitHub write previews.
