# Demo: Parallel Read-Only Planning

```bash
npm run build
node dist/cli/index.js team run "review auth and security" --parallel-readonly --dry-run
```

The output shows which lanes are eligible for read-only scheduling and which remain sequential. This demo does not claim parallel editing or OS-level sandboxing.
