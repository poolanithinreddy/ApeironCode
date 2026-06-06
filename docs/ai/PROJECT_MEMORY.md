# ApeironCode Project Memory

## Product Goal

ApeironCode is an open-source, local-first coding-agent platform. The goal is to become a serious Claude Code-style alternative focused on transparency, provider flexibility, local/self-hosted workflows, strong safety, evals, and developer control.

## Completed Roadmap Summary

### Phase 1
Native streaming providers and native tool calling. `provider.chat()` was removed from the production provider interface. `provider.stream()` and `ProviderStreamChunk` became the standard.

### Phase 2
Streaming UI through EventBus. Token streaming renders live in the TUI.

### Phase 3
Real sandbox execution with Docker, Podman, Firejail, and SandboxManager. Command results include sandbox metadata.

### Phase 4
Semantic memory retrieval. Added offline TF-IDF/hybrid memory indexing, relevant memory loading, compaction, conflict detection, quality scoring, and secret protection.

### Phase 5
Iteration budget and smart loop control. Added loop progress tracking, budget advisor, stall detection, and graceful stalled exits.

### Phase 6 / 6.5 / 6.6
File decomposition and stability refactor. Oversized files were decomposed. File-size check passes with no exceptions.

### Phase 7 / 7.5 / 7.6
Additional providers and provider polish. Added Gemini, Bedrock, Azure. Added provider health checks, env validation, doctor integration, provider list/env/test CLI.

### Phase 8 / 14A
Context intelligence upgrades. Added import graph, git context, ranker, memory signals, LSP signals, symbol extraction, symbol graph, test-source mapping, failure mapping, affected-file analysis, repo map, context plan, ranker v2, context.selected event, context CLI/devex commands.

### Phase 9
Linear, Jira, Slack connectors and ToolRegistry-based connector tools. GitHub compatibility preserved.

### Phase 10
Eval framework. Added isolated eval workspaces, assertions, runner, mock streaming harness, built-in suites, result persistence, eval CLI.

### Phase 10.5
Token efficiency. Added token estimator, eval token metrics, context compressor, memory compressor, tool-output compressor, dynamic tool exposure, reasoning style policy, prompt optimizer.

### Phase 11
Observability and developer experience. Added structured logging, tracing, improved doctor, cost estimator, session export, debug helpers, error formatter, system reports.

### Phase 12
Integration and acceptance tests. Added E2E harness, acceptance coverage, CI workflow, release checklist.

### Phase 13 / 13.5 / 13.6
GitHub automation and MCP hardening. Added issue-to-PR, PR review, CI-fix, GitHub Action support, idempotency, fork safety, patch limits, retries, rollback/checkpoint, MCP stdio/http/sse, OAuth/device auth, token store, MCP permissions, resources/prompts, ToolRegistry integration, CLI and doctor checks.

## Latest Known Validation

After Phase 14A:
- npm test: 993 passed | 18 skipped
- test:e2e: 50 passed
- test:acceptance: 58 passed
- typecheck: pass
- lint: pass
- build: pass
- check:file-size: pass
- npm pack --dry-run: pass

Skipped tests are environment-gated Docker/Podman/Firejail backend tests.

## Current Priority

Phase 14B: Memory System 2.0.

Goal:
Make memory a persistent project intelligence system, not just notes retrieval.

Sub-phases:
1. 14B.1 taxonomy, write policy, provenance.
2. 14B.2 supersession, verification, lifecycle.
3. 14B.3 retrieval planner, compaction v2, memory eval suite.
4. 14B.4 CLI/devex commands and final integration.

## Current Partial Work

14B.1 was started.
Already created:
- src/memory/taxonomy.ts
- src/memory/writePolicy.ts

Still needed:
- src/memory/provenance.ts
- tests/memory/taxonomy.test.ts
- tests/memory/writePolicy.test.ts
- tests/memory/provenance.test.ts
- targeted validation
- final sub-phase validation