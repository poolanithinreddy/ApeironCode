# Phase 20 UX Bug Audit

## What Still Felt Awkward

- Live slash command entry was too easy to misread in PTY/manual testing: submitted commands were not echoed as user messages, so it was hard to tell whether the TUI accepted input.
- Some terminal Enter paths produced newline-delimited values instead of a clean submit. This made manual `/commands ...` flows feel unreliable.
- Slash command failures could leave the UI without a clear recoverable message.
- The dashboard had accumulated too many sections and could be visually noisy on normal terminal sizes.
- Long project/task/memory text could dominate the home screen.
- Cockpit actions returned a chat message, but the cockpit panel itself did not visibly refresh after memory, conflict, export, or validation actions.
- Unknown slash commands gave suggestions, but the recovery path did not consistently point users toward the beginner palette and category palettes.
- Manual TUI testing required remembering a sequence of temp-HOME setup commands.

## Fixes Implemented In This Phase

- InputBox now extracts CR/LF-delimited submitted text and clears after submission.
- InputBox now shows a concise command hint: Enter submits, `/commands` opens help, `/dashboard` returns home.
- Slash commands are echoed as local user messages before execution.
- Slash command execution now has a recoverable busy/status/error wrapper.
- Dashboard active-task display suppresses stale failed task plans from the home page.
- Dashboard sections were reorganized around Start Here, Readiness, Project, Work, Review, Memory, Integrations, Safety, and Help.
- Dashboard long project, session, code-intelligence, and memory-summary text is compacted.
- Natural slash aliases now include `/open dashboard`, `/show memory`, `/show skills`, `/show github`, and `/setup openrouter`.
- Unknown slash commands now point to beginner and category palettes.
- Review cockpit action results now render as structured in-panel banners.
- Review cockpit actions now reload run, workspace, merge-plan, and memory-suggestion state after completing.
- Added a manual TUI smoke harness: `npm run demo:tui` and `npm run demo:ux`.

## Still Not Solved

- The cockpit is better after actions, but it is still not an IDE-grade modal review experience.
- Manual TUI proof still depends on terminal behavior; automated tests cover the state helpers and command routing, not every keypress path.
- Approval UX is clearer in-panel for cockpit results, but not every legacy approval path has the same rich panel.
- No OS sandboxing, isolated provider credentials, cloud/distributed execution, parallel editing, or semantic rename engine was added.
