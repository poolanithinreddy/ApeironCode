# Demo: Merge Resolution

```bash
node dist/cli/index.js team resolve <teamRunId>
node dist/cli/index.js team resolve <teamRunId> --file src/example.ts --action skip
node dist/cli/index.js team export-patch <teamRunId>
```

Use only disposable repositories or temp directories. Apply still requires the normal approval-gated `team apply` path.
