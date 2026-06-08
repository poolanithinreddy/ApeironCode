# Demo: Isolated Team Workspaces

This demo does not require real API keys.

```bash
npm run build
npm run demo:team-isolated
```

The script runs:

```bash
node dist/cli/index.js team run "Demo isolated team workflow" --workspace temp-copy --dry-run
```

For a real local run in a disposable fixture:

```bash
cd examples/demo/isolated-team
../../../dist/cli/index.js team run "explain this fixture and validate it" --workspace temp-copy
../../../dist/cli/index.js team workspaces
../../../dist/cli/index.js team merge-plan <teamRunId>
```

Only apply changes after reviewing the merge plan:

```bash
../../../dist/cli/index.js team apply <teamRunId>
```

`git-worktree` mode is currently planning-only. Use `temp-copy` for tested isolation.
