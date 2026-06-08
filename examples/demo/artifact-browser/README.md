# Artifact Browser Demo

Use this fixture as a disposable place to create a team run, then inspect it:

```bash
../../../dist/cli/index.js team run "review this tiny project" --workspace temp-copy --dry-run
../../../dist/cli/index.js team runs
../../../dist/cli/index.js team review <teamRunId>
../../../dist/cli/index.js team artifacts <teamRunId>
```
