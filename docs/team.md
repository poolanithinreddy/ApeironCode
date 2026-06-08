# Team Workflows

Team workflows decompose a task into ordered specialist steps and run them sequentially.

Default plan:

1. planner
2. coder
3. tester
4. reviewer

Additional roles such as docs-writer or security-reviewer can be selected by the planner when the task calls for them.

## Workspace Modes

```bash
apeironcode team run "fix failing tests" --workspace main
apeironcode team run "fix failing tests" --workspace temp-copy
apeironcode team run "fix failing tests" --workspace git-worktree
```

- `main`
  Runs subagents in the current project directory.

- `temp-copy`
  Creates an isolated temporary copy for each subagent, runs tools there, records workspace metadata, and collects changed files. The main workspace is untouched until changes are reviewed and applied.

- `git-worktree`
  Creates detached git worktrees under `.apeironcode-agent/worktrees/<teamRunId>/<workspaceId>/` when the repository is clean and git worktree support is available.

## Review And Apply

```bash
apeironcode team workspaces
apeironcode team runs
apeironcode team show <teamRunId>
apeironcode team review <teamRunId>
apeironcode team review <teamRunId> --interactive
apeironcode team cockpit <teamRunId>
apeironcode team artifacts <teamRunId>
apeironcode team artifacts <teamRunId> --filter diff
apeironcode team artifact <teamRunId> <artifactId>
apeironcode team merge-plan <teamRunId>
apeironcode team conflicts <teamRunId>
apeironcode team conflicts <teamRunId> --json
apeironcode team ignored <teamRunId>
apeironcode team resolve <teamRunId>
apeironcode team export-patch <teamRunId>
apeironcode team validate-patch <teamRunId>
apeironcode team apply <teamRunId>
apeironcode team apply <teamRunId> --file src/example.ts
apeironcode team discard <teamRunId>
apeironcode team workspace cleanup
```

`team apply` prints a structured approval review with affected files, merge-plan preview, and patch validation status. It only applies when approval mode is `trusted` or `bypass`, and failed patch validation blocks apply unless explicitly forced.

Current apply behavior uses a base snapshot, isolated result, and current main workspace. It detects main-changed, deleted-file, binary, conservative same-line conflicts, and heuristic text-file renames. It is still not a semantic merge engine.

`team review` is the quickest product surface after a run. It shows the run status, workspaces, artifact count, changed files, conflict count, and next commands. In the TUI, `/team cockpit <id>` and `/team review <id> interactive` mount a live cockpit panel with keyboard routing. The CLI commands remain command-driven text views for automation.

## Read-Only Lane Planning

```bash
apeironcode team plan "review auth and security" --parallel-readonly
apeironcode team run "review auth and security" --parallel-readonly --dry-run
```

The read-only lane scheduler only marks independent roles as eligible when their policy cannot edit and cannot run commands. Coder/tester/docs-writer work remains sequential.

## Events

Team runs write team and subagent events:

- `team_started`
- `subagent_started`
- `subagent_completed`
- `subagent_failed`
- `team_completed`
- `team_failed`
- `cockpit_opened`
- `cockpit_action`
- `artifact_opened`
- `artifact_exported`
- `conflict_skipped`
- `conflict_marked_manual`
- `patch_exported`
- `patch_validated`
- `memory_suggestion_approved`
- `memory_suggestion_rejected`

## Limitations

- No parallel editing. Phase 15 exposes conservative read-only lane scheduling/dry-run output only.
- No automatic merge without review.
- Git worktree mode requires a clean tracked working tree.
- Temp-copy isolation ignores heavy folders such as `.git`, `node_modules`, and `dist`.
- Subagents share the current process environment and configured provider/connector credentials.
