# Safe Read-Only Parallel Lanes

Phase 15 introduces a conservative scheduler for read-only team lanes.

```bash
apeironcode team plan "review auth and security" --parallel-readonly
apeironcode team run "review auth and security" --parallel-readonly --dry-run
```

Only roles whose policy is marked `parallelSafe`, cannot edit, and cannot run commands are eligible. Editing, testing, merge, apply, and command-running work stays sequential.

Parallel-safe roles include planner/reviewer/security-reviewer/lsp-agent/git-agent when their policies remain read-only. Coder, tester, docs-writer, release-manager, and networked researcher are not parallelized.

Current status: the CLI and slash surfaces expose scheduling and dry-run proofs. Full concurrent execution is intentionally limited until review and cancellation semantics are stronger.
