# TUI

Run the terminal UI:

```bash
apeironcode
```

First-run path:

```text
/setup
/commands beginner
/dashboard
```

The dashboard is the main control panel. It surfaces project state, provider/model readiness, quick actions, code intelligence, active work, integrations, safety limits, memory suggestions, and help.

Useful commands:

- `/setup` configures mock, Ollama, or provider defaults.
- `/commands beginner` shows the short command palette.
- `/commands advanced` shows deeper agent/team/integration commands.
- `/skills` opens the skill browser.
- `/memory review` shows memory suggestions.
- `/security status` reports explicit local limits.
- `/provider fallback simulate rate-limit` previews fallback behavior without an API call.
- `/github status` shows connector readiness and token setup hints without printing secrets.

The review cockpit and artifact browser are available from team commands, but the product still does not claim an IDE-grade merge UI.

Phase 20 notes:

- Submitted slash commands are echoed in the chat so you can tell what the TUI accepted.
- The input box handles newline-delimited PTY submissions more defensively and clears after command execution.
- The dashboard is intentionally more compact: Start Here, Readiness, Project, Work, Review, Memory, Integrations, Safety, and Help.
- Cockpit actions now show an in-panel result banner and refresh cockpit data after memory/conflict/export/patch actions.
- For manual testing without touching personal config, run `npm run demo:tui` after building. Use `npm run demo:ux` to print the temp-HOME smoke flow without launching the TUI.

Phase 19 notes:

- Dashboard task summaries are compacted so long stale prompts do not dominate the first screen.
- Category command palettes such as `/commands team` and `/commands memory` are intended to be the primary discovery path.
- The cockpit is still command-driven plus reducer-backed. It is not yet a fully smooth modal-style terminal cockpit across all actions.
