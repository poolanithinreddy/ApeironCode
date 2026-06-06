# Patch Export

Team patch export creates local review patches from isolated subagent workspaces.

```bash
apeironcode team export-patch <teamRunId>
apeironcode team export-patch <teamRunId> --file src/example.ts
apeironcode team export-patch <teamRunId> --include-conflicts
apeironcode team validate-patch <teamRunId>
```

Patches are written under:

```text
.apeironcode-agent/team-runs/<teamRunId>/patches/<timestamp>.patch
```

Each patch has a sidecar JSON file with the team run id, included files, excluded files, conflicts, creation time, and validation result.

Default export behavior:

- Includes clean apply-ready files.
- Excludes ignored files from `.gitignore`, `.apeironcodeignore`, and built-in workspace hygiene rules.
- Excludes skipped/manual conflict resolutions.
- Excludes binary files and conflicted files unless `--include-conflicts` is used.
- Emits standard unified diff headers intended for `git apply`.

Validation:

- In a git repository, ApeironCode runs `git apply --check <patch>` from the project root.
- Outside a git repository, ApeironCode performs structural patch validation and says the git check was skipped.
- Validation never applies a patch.

Known limits:

- Rename export is git-apply oriented but still based on the conservative text/hash merge engine.
- Conflicted exports may intentionally fail validation.
- ApeironCode does not provide OS sandboxing, isolated provider credentials, cloud/distributed execution, parallel editing, or semantic refactor-aware rename analysis.
