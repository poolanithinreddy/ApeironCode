# Demo: Review UX

Build first:

```bash
npm run build
```

Create or select a disposable team run, then show:

```bash
node dist/cli/index.js team runs
node dist/cli/index.js team review <teamRunId>
node dist/cli/index.js team artifacts <teamRunId>
node dist/cli/index.js team artifact <teamRunId> <artifactId>
node dist/cli/index.js team conflicts <teamRunId>
```

The demo should emphasize that artifacts are local, redacted on display, and reviewed before apply/discard.
