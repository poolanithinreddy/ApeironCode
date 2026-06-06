# ApeironCode — Agent Working Instructions

You are working on the ApeironCode codebase (formerly developed as OpenCode Agent; the legacy `apeironcode-agent` package name and `OPENCODE_*` env vars are retained for back-compat).

ApeironCode is an open-source, local-first coding-agent platform inspired by Claude Code-style workflows. The project has advanced from a basic CLI into a production-grade coding-agent architecture with native provider streaming, ToolSchema-based tools, sandboxing, memory, context intelligence, GitHub automation, MCP, evals, token efficiency, and E2E acceptance coverage.

## Non-Negotiable Architecture Invariants

- Do not reintroduce `provider.chat()`.
- The provider interface must use `provider.stream()` and `ProviderStreamChunk`.
- Do not reintroduce XML tool directives as the production path.
- All agent-callable tools must go through `ToolSchema` and `ToolRegistry`.
- Do not bypass `ToolRegistry` for tool execution.
- Do not make real external network calls in default tests.
- Do not require real API keys in default tests.
- Do not leak secrets in logs, traces, tests, snapshots, CLI output, doctor output, exports, or tool results.
- Keep TypeScript strict.
- Avoid `any`.
- Keep files under 600 lines.
- Prefer files under 250–350 lines.
- Use mocks, fixtures, and temp workspaces for tests.
- Preserve existing behavior unless the current task explicitly changes it.

## Completed Major Systems

- Native streaming provider architecture.
- Native tool calling through ToolSchema and ToolRegistry.
- Streaming TUI through EventBus.
- Sandbox execution with Docker, Podman, Firejail, and fallback safety.
- Advanced memory retrieval and compression.
- Context Intelligence 2.0 with symbols, ranker v2, test/source mapping, affected-file analysis, repo map, context plan, and context-selected events.
- Token efficiency and prompt/context/tool-output compression.
- Eval framework with smoke, coding, safety, tools, token efficiency, GitHub automation, MCP, and context intelligence suites.
- GitHub automation with issue-to-PR, PR review, CI-fix workflows, idempotency, fork safety, patch limits, retries, rollback/checkpoints, and GitHub Action support.
- MCP 2.0 with stdio/http/sse, tools, resources, prompts, permissions, OAuth/device-flow support, token store, CLI, and doctor checks.
- Structured logging, tracing, doctor diagnostics, cost/token reporting, session export, debug helpers.
- E2E and acceptance tests.
- CI workflow.

## Current Focus

Current active phase: Phase 14B — Memory System 2.0.

Work in sub-phases:
1. 14B.1 — memory taxonomy, write policy, provenance.
2. 14B.2 — supersession, verification, lifecycle.
3. 14B.3 — retrieval planner, compaction v2, memory eval suite.
4. 14B.4 — memory CLI/devex commands and final integration.

## Development Workflow

For each task:
1. Read the relevant files first.
2. Run baseline validation or targeted validation depending on task size.
3. Implement the smallest meaningful change.
4. Add focused tests.
5. Run targeted tests.
6. Run full validation at the end of the sub-phase.
7. Return a concise report.

## Validation Strategy

For small sub-phases, use targeted validation first:
- npm run typecheck
- npm run lint
- targeted tests

Run full validation only at the end:
- npm run build
- npm test
- npm run test:e2e
- npm run test:acceptance
- npm run check:file-size
- npm pack --dry-run

Do not repeatedly run the full suite after every tiny edit.

## Reporting

Final reports should be concise:
1. Files changed
2. Features implemented
3. Tests added/updated
4. Validation result
5. Remaining gaps

Do not paste long logs unless a command failed.