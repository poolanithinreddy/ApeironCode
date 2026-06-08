# Demo: Review Cockpit

Use a disposable fixture team run:

```bash
node dist/cli/index.js team cockpit <teamRunId>
node dist/cli/index.js team review <teamRunId> --interactive
node dist/cli/index.js team artifacts <teamRunId> --filter diff
```

The demo shows command-driven cockpit panes and the tested keyboard state model. It does not claim a fully mounted modal navigator yet.
