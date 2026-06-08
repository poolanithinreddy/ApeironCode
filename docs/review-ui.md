# Review UI

Phase 15 adds command-driven review surfaces for team runs and artifacts.

```bash
apeironcode team review <teamRunId>
apeironcode team artifacts <teamRunId>
apeironcode team artifact <teamRunId> <artifactId>
apeironcode team conflicts <teamRunId>
```

`team review` summarizes the run goal, status, workspace modes, artifact count, changed-file count, conflict count, and next actions. `team artifacts` groups local artifacts by type and `team artifact` shows a redacted, safely truncated selected artifact.

These are rich text/view-model surfaces today, not a full arrow-key navigator. They are designed so the TUI can render the same data without exposing raw JSON or secrets.
