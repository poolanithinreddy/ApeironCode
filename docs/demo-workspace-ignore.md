# Demo: Workspace Ignore Hygiene

Create a disposable team run that writes cache or log files in an isolated workspace, then inspect:

```bash
node dist/cli/index.js team ignored <teamRunId>
node dist/cli/index.js team merge-plan <teamRunId>
```

Built-in ignore rules plus `.gitignore` and `.apeironcodeignore` keep cache/log/temp files out of merge plans.
