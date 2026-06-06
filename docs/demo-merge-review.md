# Demo: Merge Review

The merge-review demo is designed for disposable repositories.

```bash
npm run build
npm run demo:merge-conflict
```

Useful commands:

```bash
apeironcode team merge-plan <teamRunId>
apeironcode team conflicts <teamRunId>
apeironcode team apply <teamRunId> --file src/example.ts
apeironcode team discard <teamRunId>
```

Conflict output explains the file, conflict type, reason, and next commands. Apply remains approval-gated.
