# Workspace Ignore Hygiene

Team workspace diff collection now filters generated/noisy files before merge planning.

Ignore sources:

- built-in rules: `.git/`, `.apeironcode-agent/`, `node_modules/`, `dist/`, `coverage/`, `.DS_Store`, local cache/home/log/temp paths
- `.gitignore`
- `.apeironcodeignore`

Commands:

```bash
apeironcode team ignored <teamRunId>
apeironcode team merge-plan <teamRunId>
```

Ignored files are excluded from merge planning, conflict detection, and patch export. They can still be inspected with `team ignored`.
