# Merge Review

Isolated team workspaces are never merged silently.

```bash
apeironcode team merge-plan <teamRunId>
apeironcode team conflicts <teamRunId>
apeironcode team conflicts <teamRunId> --file src/example.ts
apeironcode team conflicts <teamRunId> --json
apeironcode team ignored <teamRunId>
apeironcode team resolve <teamRunId>
apeironcode team apply <teamRunId>
apeironcode team apply <teamRunId> --file src/example.ts
apeironcode team discard <teamRunId>
```

## Merge Engine

ApeironCode stores a base snapshot when the workspace is created. Merge review compares:

- base snapshot
- isolated workspace result
- current main workspace

It classifies:

- clean files
- main-changed conflicts
- deleted-file conflicts
- binary conflicts
- same-line conflicts
- clean renames
- rename-source conflicts
- rename-target conflicts
- skipped files
- ignored files filtered before merge planning

## Approval

`team apply` prints an approval review with affected files, merge-plan preview, risk level, and target team run. It only applies when approval mode is `trusted` or `bypass`.

## Limitations

- Rename detection is heuristic for text files. It is useful for straightforward moves, but it is not a semantic refactor detector.
- Binary files are reported as conflicts and skipped.
- Same-line conflict detection is conservative.
- This is not a semantic merge resolver.
