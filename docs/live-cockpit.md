# Live Cockpit

The live review cockpit is available from the interactive TUI:

```text
/team cockpit <teamRunId>
/team review <teamRunId> interactive
```

It opens a mounted Ink panel in the dashboard area. Use arrow keys to move through panes and selections, `?` for help, `q` to close, `e` to export, `a` for apply-style actions, and `r` for reject/skip actions.

The CLI remains command-driven:

```bash
apeironcode team cockpit <teamRunId>
apeironcode team review <teamRunId> --interactive
```

Cockpit actions are intentionally conservative. Merge apply, discard, and other destructive actions still require explicit approval and can be completed through the corresponding CLI/slash command after reviewing the preview.
