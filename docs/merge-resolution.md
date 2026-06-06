# Merge Resolution

Merge resolution records user decisions before applying isolated team workspace changes.

```bash
apeironcode team resolve <teamRunId>
apeironcode team resolve <teamRunId> --file src/example.ts --action skip
apeironcode team resolve <teamRunId> --file src/example.ts --action manual
apeironcode team resolve <teamRunId> --file src/example.ts --action apply
apeironcode team export-patch <teamRunId>
apeironcode team validate-patch <teamRunId>
```

Resolution actions:

- `skip`: exclude the file from full apply.
- `manual`: block full apply until the file is resolved or skipped.
- `apply`: record intent to apply; actual apply still uses the approval-gated `team apply` path.

`export-patch` now writes a unified diff under `.apeironcode-agent/team-runs/<teamRunId>/patches/` plus a sidecar JSON file with files, exclusions, conflicts, and validation status. By default it excludes ignored files, skipped/manual resolutions, binary files, and conflicted files.

`validate-patch` runs `git apply --check` when the project is inside a git repository. Outside git repositories it performs structural validation and reports that the git check was skipped. Validation never applies the patch.
