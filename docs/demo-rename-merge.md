# Demo: Rename Merge

Use a disposable directory. Do not run merge demos against an important working tree.

1. Run a team workflow in `temp-copy` or `git-worktree` mode.
2. In the isolated workspace, rename a text file.
3. Inspect:

```bash
node dist/cli/index.js team merge-plan <teamRunId>
node dist/cli/index.js team conflicts <teamRunId>
```

Clean renames appear in the merge plan. Source/target conflicts are reported and are not applied automatically.
