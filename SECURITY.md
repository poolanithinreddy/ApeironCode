# Security Policy

ApeironCode is **pre-1.0 / early alpha**. Security is handled on a best-effort
basis, but we take it seriously — the tool edits files and runs shell commands
on your machine, so the safety model matters.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` branch / latest release | Best effort |
| older tags | Not supported |

There is no formal SLA at this stage.

## Reporting a vulnerability

Please report security issues **privately** to the maintainers before opening a
public issue. Do **not** post secrets, tokens, or private repository contents in
a public issue or PR.

Include:

- affected command, feature, or code path
- reproduction steps
- expected vs actual behavior
- impact assessment
- whether debug mode (`APEIRONCODE_DEBUG=1` / `--verbose`) was used

## What counts as security-sensitive

- unsafe or unexpected shell command execution
- approval bypass (a write or command running without approval)
- secret/API-key leakage in logs, traces, exports, snapshots, or tool output
- path traversal or writes outside the workspace
- unintended or silent file writes
- provider key exposure

## Command execution & safety model

- Read-only operations are low risk by default.
- File edits/writes show a diff and require approval.
- Shell commands, tests, and commits require approval unless you explicitly pass
  `--dangerously-skip-approvals`.
- Dangerous commands (`sudo`, `curl | sh`, `wget | sh`, system path permission
  changes) are blocked; high-risk commands (`rm -rf`, destructive git resets,
  `npm publish`) require extra confirmation.
- Sensitive files (`.env`, SSH keys, secret stores) require explicit approval to
  read.
- Web access is ask-first; `web_fetch` blocks `localhost`/private IPs by default.

## Environment variable guidance

- Provide provider keys via environment variables (see `.env.example`).
- Never commit real keys. `.env` and `.env.local` are gitignored.
- ApeironCode never prints full keys in setup, status, or doctor output, and
  redacts secret-like content in exports and tool results.
