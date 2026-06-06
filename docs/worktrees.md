# ApeironCode Agent Worktrees

Agent worktrees allow ApeironCode to run agent tasks in **isolated git worktrees**, keeping your main working tree safe and clean.

---

## How It Works

When you create a task with `--worktree`, ApeironCode:

1. Creates a new git branch: `apeironcode/task/<slug>-<shortid>`
2. Creates a git worktree at `.apeironcode-agent/worktrees/<task-id>/`
3. The agent runs with `cwd` set to the worktree directory
4. Your main working tree is **never modified**

---

## Branch Naming

Worktree branches always use the prefix `apeironcode/task/`:

```
apeironcode/task/fix-auth-tests-a1b2c3
apeironcode/task/implement-oauth-module-d4e5f6
```

---

## CLI Examples

```bash
# List known ApeironCode worktrees
apeironcode worktree list

# Show worktree details
apeironcode worktree show <worktreeId>

# Remove a worktree (requires --yes for safety)
apeironcode worktree remove <worktreeId> --yes
```

---

## Cleanup

**Worktrees are never cleaned up automatically.** This is intentional — you may want to inspect, continue, or merge the work even if the task failed.

To remove a worktree manually:

```bash
# Via ApeironCode
apeironcode worktree remove <id> --yes

# Or directly with git
git worktree remove .apeironcode-agent/worktrees/<id> --force
git branch -D apeironcode/task/<slug>-<shortid>
```

---

## Safety Guarantees

| Guarantee | How |
|-----------|-----|
| Main tree never modified | Worktrees are created under `.apeironcode-agent/worktrees/` |
| Path safety | Refuses to create/remove worktrees outside the project worktrees root |
| No auto-cleanup | Explicit `--yes` required for removal |
| Git errors surfaced | Clear error messages if repo is not clean or branch already exists |

---

## Requirements

- Project must be a git repository (`git init`)
- Working tree must be clean enough to create a new worktree (no conflicts)
- Git must support `worktree add` (Git 2.5+)

---

## Worktree Reconciliation (Phase 16D.1)

`reconcileAgentWorktrees()` cross-references the JSON store against `git worktree list --porcelain`:

- **Missing**: stored worktrees no longer present in git → flagged in `worktree list` output
- **Discovered**: ApeironCode branches in git that aren't in the JSON store → listed for awareness
- **No automatic deletion**: reconciliation only reports, never deletes

```bash
apeironcode worktree list   # shows [missing from git] flag when applicable
```

## Agent Loop Integration (Phase 16D.1)

Worktree agent tasks now wire into the live Agent loop when an `AgentRunner` is available:

1. Worktree is created (`apeironcode/task/<slug>-<id>`)
2. Agent runs with `cwd = worktreePath`
3. Output summary includes branch, path, and agent output
4. Worktree is kept after success or failure for review

## Known Limitations (Phase 16D.1)

- Reconciliation parses `git worktree list --porcelain` output but does not auto-heal.
- Remote branch push is not automated — handle merges manually.
- Checkpoint-based file restore in worktrees is a future phase.
