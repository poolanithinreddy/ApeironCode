# Context Intelligence 2.0

ApeironCode's Context Intelligence 2.0 layer selects which files, tests, and signals to put in the
agent's prompt before each turn. It is deterministic, token-budget aware, and explainable.

## What signals are used

| Signal | Source | Notes |
| --- | --- | --- |
| Name match | filename vs prompt terms | basic lexical similarity |
| Prompt term match | path vs prompt terms | full-path containment |
| Symbol name match | `src/context/symbols.ts` | exported symbols whose names appear in the prompt |
| Symbol references | `src/context/symbolGraph.ts` | textual references between exported symbols, boosted when the source file is imported |
| Test relation | `src/context/testMapper.ts` | `tests/foo.test.ts ↔ src/foo.ts`, `__tests__`, `*_test.go`, `FooTest.java`, etc. |
| Failure mapping | `src/context/failureMapper.ts` | TypeScript / ESLint / Vitest / pytest / Go / Java failure parsing |
| Affected files | `src/context/affectedFiles.ts` | direct, dependents, tests, configs, package boundaries |
| Repo map / framework hints | `src/context/repoMap.ts` | Next.js / React / Node / Python / Go / Java |
| Context plan | `src/context/contextPlan.ts` | task type → full / summary / test / excluded files |
| Git recency | `src/context/gitContext.ts` | uncommitted, staged, recently changed |
| Memory relevance | `src/context/memorySignals.ts` | facts in the memory graph |
| LSP diagnostics | `src/lsp/*` | error/warning counts |
| Import graph | `src/context/importGraph.ts` | direct + transitive |

These feed `rankFilesV2` (`src/context/ranker.ts`), which produces a deterministic ordering plus
human-readable signal labels (`plan-full`, `failure-signal`, `symbol-reference`, etc.).

## Task types

`buildContextPlan(prompt, files, signals, mode)` classifies the task into one of:

`explain · debug · test_fix · feature · refactor · review · connector · github_automation · mcp · unknown`

Each task type has a default token budget, default likely tools, and a different policy for
promoting files to `fullFiles`, `summaryFiles`, `testFiles`, or `excludedFiles`. For example,
`connector` / `github_automation` / `mcp` tasks exclude the test tree by default to avoid scanning
the whole repo.

## Caching and invalidation

`src/context/contextCache.ts` provides a per-scope, fingerprint-keyed JSON cache.

- Fingerprints are computed from sorted `(path, mtime, size)` tuples plus the scope name and
  optional prompt.
- Corrupt cache files are detected and rebuilt automatically.
- Stale entries (default TTL 24h) are recomputed.
- `invalidate(scope)` clears the cache for a specific subsystem.

The repo map (`src/context/repoMap.ts`) keeps its own staleness signal driven by config
signature, file count delta, and last-indexed timestamp.

## Debugging context selection

These CLI commands surface the system's reasoning:

- `apeironcode context plan "<prompt>"` — show the planned task type, full/summary/test files, and
  token budget.
- `apeironcode context map` — repo map summary, frameworks, package manager, important files.
- `apeironcode context symbols <query>` — search indexed symbols across the repo.
- `apeironcode context affected <file>` — direct + dependent + test + config files for a change.
- `apeironcode context tests <file>` — likely test files for a source file.
- `apeironcode context explain "<prompt>"` — packed context preview.
- `apeironcode context why [<prompt>]` — explain selection rationale.

Each command degrades gracefully and never prints secrets.

## Events

`context.selected` events now include:

- `taskType`
- `summaryFiles`, `testFiles`, `relatedFiles`, `omittedFiles`
- `tokenBudgetEstimate`
- `warnings` when a sub-system (symbol graph, test mapper, repo map) failed and the builder fell
  back to a coarser ranking.

`context.compressed` continues to report compression ratio and per-bucket counts.

## Running context evals

The `contextIntelligence` suite registers ten cases covering explicit-file mention, test-source
mapping, refactor dependents, symbol mention, review-prioritizes-changed, explain-prefers-summary,
connector-no-full-scan, cache rebuild, and token-budget enforcement.

```bash
npx tsx src/cli/index.ts eval run contextIntelligence
```

## Known limitations

- Symbol extraction is regex-based; deeply nested or highly dynamic code may be missed.
- Symbol references rely on textual matches and can over-match common identifiers; the import
  graph is used as a corroborating signal.
- The failure mapper recognizes the most common TS/JS/Python/Go/Java patterns but does not parse
  every test framework.
- The context cache is per-project, not global; switching branches with very different file sets
  triggers a rebuild.
- No real network calls are used for context selection.
