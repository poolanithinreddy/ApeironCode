# Team Artifacts

Team runs now write a local artifact record under:

```text
.apeironcode-agent/team-runs/<teamRunId>/
```

Artifacts can include:

- plan
- subagent outputs
- workspace diffs
- final summary
- merge plans
- conflict reports

## Commands

```bash
apeironcode team runs
apeironcode team show <teamRunId>
apeironcode team review <teamRunId>
apeironcode team artifacts <teamRunId>
apeironcode team artifacts <teamRunId> --filter diff
apeironcode team artifacts <teamRunId> --search auth
apeironcode team artifact <teamRunId> <artifactId>
apeironcode team artifact <teamRunId> <artifactId> --preview
apeironcode team export <teamRunId>
```

`team artifacts` groups artifacts by kind. `team artifact` shows selected content with secret redaction and safe truncation for long artifacts.

These are local files only. They are separate from share/export, although future phases can fold team artifacts into session exports more deeply.
