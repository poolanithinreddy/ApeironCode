# Patch Export Demo Fixture

Use a disposable team run id to inspect patch generation:

```bash
npm run build
node dist/cli/index.js team export-patch <teamRunId>
node dist/cli/index.js team validate-patch <teamRunId>
```

Validation uses `git apply --check` only when the fixture is inside a git repository.
