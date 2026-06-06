# Product Audit

Date: 2026-05-01

## Already Strong

- Broad terminal-native CLI/TUI surface with one-shot and interactive flows.
- Safety model includes approvals, permission rules, sensitive path checks, command guards, audit logs, patch previews, and revert tooling.
- Provider architecture already supports local and cloud providers, model recommendations, fallback planning, cost tracking, and mock providers for tests.
- LSP foundation is unusually strong for a terminal agent: detection, long-lived process-local sessions, diagnostics, symbols, definitions, references, and cache snapshots.
- Local-first multi-session infrastructure exists with session metadata, background workers, event logs, file locks, local export, and share redaction.
- Test suite is broad: baseline validation passed with 399 tests once sandbox loopback was approved.

## Weak

- Several advanced surfaces were foundations rather than productized workflows: memory, skills, connectors, hooks, subagents, and repo-brain context were not first-class CLI concepts.
- TUI dashboard has useful state but still lacks a premium command-palette density and richer provider/session/error cards.
- Runtime provider fallback existed but only for a single configured fallback and lacked explicit error classification.
- GitHub workflow was absent even as PR review and connector workflows are table stakes for serious coding agents.

## What Would Disappoint A Real Developer

- No reusable local skill/workflow format before this sprint.
- No safe GitHub issue/PR command surface before this sprint.
- Memory was mostly markdown/session learning, not a queryable graph.
- Context explainability was mostly file ranking, not token-budget reporting.
- Team/subagent concepts existed in sessions, but no named specialist agent registry was exposed.

## Missing Compared With Serious Coding Agents

- Deep background PR branch workflow, remote CI iteration, and cloud sandbox execution.
- Full custom command/skill marketplace.
- Rich MCP prompt discovery as slash commands.
- IDE-grade code actions, rename, semantic references, and workspace-wide diagnostics.
- Multi-agent parallel execution with independent worktrees.

## Missing Compared With Premium Terminal UX

- Full-screen command palette with fuzzy filtering and categories.
- More polished tool cards, diagnostic cards, provider readiness cards, and error recovery prompts.
- User-tunable compact/verbose rendering modes throughout all screens.
- Built-in asciinema/VHS demo recordings and screenshots.

## Safety/Security Risks

- Any connector write action must remain approval-gated and token-redacted.
- Shell hooks can become dangerous if enabled without explicit approval and sanitized environments.
- Durable memory must avoid secrets and detect stale/conflicting facts.
- Background workers need clear stop semantics, event logging, and file lock cleanup.

## Over-Engineered

- Some phase-report documents are more complete than the product surfaces they describe.
- Session/background terminology sometimes overlaps with saved chat sessions, task plans, and multi-agent sessions.

## Under-Tested

- TUI rendering states beyond view-model tests.
- End-to-end provider fallback behavior with live-like mocked providers.
- Connector write/comment approval flows.
- Hook execution in realistic lifecycle events.

## Undocumented

- Skills, hooks, connectors, subagent teams, and repo-brain context commands needed dedicated docs.
- Security model needed connector/hook-specific threat notes.
- Public demo scripts needed a single operator guide.

## Highest-Impact Slices

1. Durable memory graph with dedupe, search, review, prune, and CLI/slash routes.
2. Local skills with schema validation, starter skills, run plans, and scoped tools.
3. Safe GitHub connector foundation with read commands and approval-gated write design.
4. Provider failure classification and explicit runtime fallback events.
5. Subagent/team registry with sequential plan-run workflow.
6. Hook registry with disabled-by-default shell safety.
7. Token-efficient repo brain index, summaries, dependency graph, packer, and budget report.
8. Launch docs, demo scripts, and honest comparison docs.
