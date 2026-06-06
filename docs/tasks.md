# ApeironCode Background Tasks

ApeironCode supports **local background tasks** — named, tracked units of work that you can create, inspect, stop, and resume without any external services or daemons.

> **Phase 16D scope:** Tasks run synchronously in-process. True background/parallel execution is a future phase.

---

## Task Statuses

| Status | Description |
|--------|-------------|
| `queued` | Created, not yet started |
| `running` | Currently executing |
| `paused` | Suspended mid-run |
| `succeeded` | Completed successfully |
| `failed` | Finished with an error |
| `stopped` | Stopped by the user |
| `cancelled` | Cancelled before start |

## Task Kinds

| Kind | Description |
|------|-------------|
| `agent` | AI agent task using a markdown-defined or default agent |
| `shell` | Shell command task |
| `review` | Code review task |
| `test-fix` | Test-fixing task |
| `workflow` | Renders and runs a markdown command prompt |

## Task Isolation

Tasks can run in the **main working tree** (`none`) or in an **isolated git worktree** (`worktree`).

---

## CLI Examples

```bash
# Create a task (queued, not yet run)
apeironcode task create "Fix failing auth tests" --kind test-fix

# Create and start immediately
apeironcode task create "Review PR changes" --kind workflow --command review-pr --start

# Create a worktree-isolated agent task
apeironcode task create "Implement OAuth module" --kind agent --agent code-writer --worktree --start

# List tasks
apeironcode task list

# Filter by status or kind
apeironcode task list --status queued
apeironcode task list --kind agent

# Show task details
apeironcode task show <taskId>

# Show task output/logs
apeironcode task output <taskId>

# Stop a running or queued task
apeironcode task stop <taskId>

# Resume a stopped or paused task
apeironcode task resume <taskId>
```

---

## Task Storage

Tasks are stored as JSON files under `.apeironcode-agent/bg-tasks/` in the project directory. Each task is a separate file (`<uuid>.json`), sorted by `updatedAt` descending.

- No secrets are stored in task files — prompts and logs are redacted before writing.
- Log lines are capped at 500 characters each.
- Tasks keep at most 200 log lines.

---

## Task Lifecycle

```
queued → running → succeeded
                 → failed
       → stopped (by user)
       → cancelled
paused → queued → running ...
stopped → queued → running ...
```

---

## Agent Task Execution (Phase 16D.1)

When `--start` is passed and an `AgentRunner` is wired in (via the CLI bootstrap), agent tasks run through the live ApeironCode Agent loop:

```
task.prompt → buildAgentTaskPrompt() → AgentRunner → AgentTaskRunResult → outputSummary/errorSummary
```

- `kind: review` tasks use `mode: review`
- `kind: test-fix` tasks use `mode: test-fix`
- `kind: agent` tasks use `mode: edit`
- Worktree tasks pass `worktreePath` as the agent cwd

## Checkpoint-Aware Resume (Phase 16D.1)

`apeironcode task resume <taskId>` builds a **resume plan** before re-running:

| Strategy | When |
|----------|------|
| `checkpoint` | A runtime snapshot or checkpoint ID is found |
| `worktree-rerun` | Task has a worktree path but no checkpoint |
| `fresh-rerun` | No checkpoint, no worktree |
| `not-resumable` | Task is `succeeded`, `running`, `queued`, or `cancelled` |

The strategy is printed before execution so you know what happened.

## Known Limitations (Phase 16D.1)

- Tasks run synchronously (`--start`). No true background daemon yet.
- Checkpoint resume prepares the plan and logs it; full restore (file revert) is a future phase.
- Worktree isolation requires a clean git working tree.
