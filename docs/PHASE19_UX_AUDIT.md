# Phase 19 UX Audit

Date: 2026-05-02

## Live Checks

Ran with a temporary home:

```bash
HOME=/private/tmp/apeironcode-phase19-home-f7WlrC node dist/cli/index.js setup --provider mock
HOME=/private/tmp/apeironcode-phase19-home-f7WlrC node dist/cli/index.js
```

Checked dashboard, `/commands`, `/commands beginner`, `/commands team`, `/skills`, `/memory review`, `/provider fallback simulate rate-limit`, `/github status`, and `/security status`.

## Findings

1. The dashboard is much more useful than earlier phases, but it can still become noisy when stale task/session records contain huge prompts.
2. `/commands team` felt broken because it opened the `/team` command detail instead of the Team/Cockpit category view.
3. Command discovery is better, but workflows still rely heavily on typed commands rather than a fully mounted interactive cockpit.
4. Provider fallback was hard to trust because failure simulation was not visible enough from CLI/slash.
5. GitHub PR/CI commands were shallow; PR review existed, but summary/files and Actions failure explanation were not daily-use friendly.
6. Memory review existed, but destructive controls such as rollback and forget-session were not easy to discover or safely preview.
7. Skill browser existed, but filtering, trust labels, and enable/disable controls needed product-level polish.
8. Missing GitHub token and no-remote states are clear enough for `github status`, but PR/CI subcommands need the same no-secret hints.
9. Security limits are visible and honest; no OS sandboxing, isolated credentials, cloud execution, or parallel editing are claimed.
10. Built CLI smoke coverage needed a product-flow test that uses a temp HOME and mock setup.

## Fixes Implemented In This Phase

- Dashboard active task goals are now compacted so stale long prompts do not flood the first screen.
- `/commands team` and other category queries now render category catalogs instead of raw command-detail pages.
- Added provider fallback simulation for missing-key, rate-limit, timeout, invalid-response, and malformed-tool-call.
- Added CLI/slash provider fallback simulation output with classification and autoFallback behavior.
- Added GitHub PR summary, PR review dry-run/post flow, Actions listing, and CI failure explanation with mocked tests.
- Added memory conflict/stale/source/rollback/forget-session commands with confirmation previews.
- Added skill browser filter/search plus trust/enable/disable commands.
- Added built-CLI temp-HOME product flow test for setup, fallback simulation, GitHub status, and security status.

## Still Weak

- The TUI is improved but not a best-in-class cockpit: keyboard navigation is not yet uniformly smooth across all screens.
- Cockpit actions exist, but still need a more fluid in-panel refresh loop for repeated review actions.
- GitHub CI failure explanation is API/report based, not a deep log-semantic debugger.
- Memory rollback is conservative removal of graph entities/edges, not a rich undo history with inverse facts.
- Sandbox support remains detection/status only.
