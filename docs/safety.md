# Safety

ApeironCode Agent treats safety as a first-class runtime concern.

Approval modes:

- `ask`: explicit approvals when a tool requests them.
- `auto-read`: low-risk project reads can proceed automatically.
- `trusted`: in-project reads and writes can auto-approve, but commands and git actions still require approval.
- `bypass`: all approvals are skipped for the current run. This should only be used in trusted automation.

Guardrails:

- External paths and sensitive files require approval.
- Diffs are shown before file writes and edits.
- Commands are checked for blocked and high-risk patterns before execution.
- `sudo`, `curl | sh`, `wget | sh`, and system permission changes are blocked.
- Destructive deletion and destructive git operations require stronger confirmation.

The design goal is simple: no silent mutation, no silent execution, and no secret access without user visibility.