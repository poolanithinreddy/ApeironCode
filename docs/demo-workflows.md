# Demo: Typed Workflow Runtime

This demo does not require real API keys for dry-run mode.

```bash
npm run build
npm run demo:workflow-runtime
```

The script runs:

```bash
node dist/cli/index.js workflow run fix-tests --dry-run
```

Other useful proof commands:

```bash
node dist/cli/index.js workflow list
node dist/cli/index.js workflow show fix-tests
node dist/cli/index.js workflow run review-diff --dry-run
node dist/cli/index.js workflow report <runId>
```

Non-dry workflow runs use the configured provider and write reports to `.apeironcode-agent/workflows/reports.json`.
