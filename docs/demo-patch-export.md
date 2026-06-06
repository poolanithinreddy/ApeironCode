# Demo: Patch Export

Patch export is easiest to demonstrate in a disposable git repository or fixture.

```bash
npm run build
node dist/cli/index.js team export-patch <teamRunId>
node dist/cli/index.js team validate-patch <teamRunId>
```

The patch is written under `.apeironcode-agent/team-runs/<teamRunId>/patches/` with a JSON sidecar. In git repositories, validation runs `git apply --check`; outside git repositories, ApeironCode reports structural validation.

Do not run patch apply demos against a personal working tree. Use temp directories or demo fixtures.
