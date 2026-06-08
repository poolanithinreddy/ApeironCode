# Session Sharing & Export

ApeironCode Agent can export session records to shareable formats: Markdown, JSON, and HTML. Exports are **local only** — no cloud upload or remote sharing link (yet).

## Overview

Session exports create a snapshot of:
- Session metadata (goal, status, mode, provider, model)
- Timeline (created, started, completed)
- Work summary (files changed, commands run, tests executed)
- Linked task (if any)

Exports are stored in `.apeironcode-agent/shares/` with file:// URLs for local access.

## Formats

### Markdown

Human-readable report optimized for documentation and PR comments.

**Example**: `session-abc12345-2026-04-30.md`

```markdown
# Session Report: Review auth module

## Metadata
- **Session ID**: `abc12345-1234-5678-...`
- **Status**: completed
- **Mode**: review
- **Model**: claude-opus-4-7
- **Provider**: anthropic

## Timeline
- **Created**: 4/30/2026, 9:30:00 PM
- **Started**: 4/30/2026, 9:30:05 PM
- **Completed**: 4/30/2026, 9:45:30 PM
- **Duration**: 15 minutes

## Work Summary
Reviewed authentication module for security best practices. Found and documented potential XSS vulnerability in token handling.

## Files Changed
- src/auth.ts
- src/login.spec.ts
- docs/security.md
- ... and 2 more

## Commands Run
- npm test
- git commit -m "docs: add security audit notes"
- git log --oneline -5

## Tests Run
- tests/auth.test.ts
- tests/login.test.ts

## Export Info
- **Exported**: 4/30/2026, 9:46:00 PM
- **Project**: /home/user/myapp
```

### JSON

Machine-readable format for programmatic processing and archiving.

**Example**: `session-abc12345-2026-04-30.json`

```json
{
  "sessionId": "abc12345-1234-5678-...",
  "goal": "Review auth module",
  "status": "completed",
  "mode": "review",
  "provider": "anthropic",
  "model": "claude-opus-4-7",
  "createdAt": "2026-04-30T21:30:00.000Z",
  "startedAt": "2026-04-30T21:30:05.000Z",
  "completedAt": "2026-04-30T21:45:30.000Z",
  "summary": "Reviewed authentication module for security best practices...",
  "filesChanged": [
    "src/auth.ts",
    "src/login.spec.ts",
    "docs/security.md"
  ],
  "filesLocked": [],
  "commandsRun": [
    "npm test",
    "git commit -m \"docs: add security audit notes\"",
    "git log --oneline -5"
  ],
  "testsRun": [
    "tests/auth.test.ts",
    "tests/login.test.ts"
  ],
  "projectPath": "/home/user/myapp",
  "exportedAt": "2026-04-30T21:46:00.000Z"
}
```

### HTML

Styled, self-contained report for viewing in a browser.

**Example**: `session-abc12345-2026-04-30.html`

- Responsive layout
- Color-coded status badges
- Readable typography
- Works offline (no external dependencies)

## Commands

### Export Latest Session

```bash
apeironcode share latest
```

Exports the most recent session to JSON (default format).

**Output**:

```
Session exported to: file:///home/user/myapp/.apeironcode-agent/shares/session-abc12345-2026-04-30.json
```

### Export with Format

```bash
apeironcode share latest --format markdown
apeironcode share latest --format html
apeironcode share latest --format json
```

### Export Specific Session

```bash
apeironcode share <session-id>
```

Exports a specific session by ID.

```bash
apeironcode share abc12345 --format html
```

### Open Export

Once exported, open the file:// URL in your browser or text editor:

```bash
# Markdown
cat /path/to/.apeironcode-agent/shares/session-abc12345-2026-04-30.md

# JSON
cat /path/to/.apeironcode-agent/shares/session-abc12345-2026-04-30.json

# HTML (in browser)
open file:///path/to/.apeironcode-agent/shares/session-abc12345-2026-04-30.html
```

## Redaction

All exports automatically redact secrets using pattern-based rules:

```
api_key=secret123 → api_key=[REDACTED]
Bearer token-abc → Bearer [REDACTED]
password=hunter2 → password=[REDACTED]
Authorization: ... → authorization=[REDACTED]
EXPORT_API_KEY=... → [REDACTED VALUE]
-----BEGIN RSA PRIVATE KEY-----...-----END RSA PRIVATE KEY----- → [REDACTED PRIVATE KEY]
```

### Limitations

Redaction uses regex patterns and may not catch:
- Non-standard secret formats
- Obfuscated or encoded secrets
- Secrets in comments

**Best practice**: Review exports before sharing with others. Don't assume redaction is 100% effective.

## Location

Exports are stored in `.apeironcode-agent/shares/`:

```
.apeironcode-agent/
├── sessions/
│   ├── abc12345-1234-5678-....json
│   ├── def67890-abcd-efgh-....json
│   └── ...
├── locks/
│   └── locks.json
└── shares/
    ├── session-abc12345-2026-04-30.json
    ├── session-abc12345-2026-04-30.md
    ├── session-abc12345-2026-04-30.html
    ├── session-def67890-2026-04-30.json
    └── ...
```

## Limitations

### No Cloud Upload

Exports remain local. To share with others:

1. Export to Markdown or JSON
2. Manually send via email, Slack, GitHub, etc.
3. Recipients cannot resume the session (sessions are local only)

Cloud upload and remote sharing links are planned for a future phase.

### No Live Updates

Exports are snapshots. They do not update as the session continues. To capture final state:

1. Stop or complete the session
2. Export it

Continuous export streaming is not yet supported.

### Format-Specific Limits

- Markdown exports cap file/command lists at 20 items with "...and N more" notation
- HTML exports have the same cap for readability
- JSON exports include all data without caps

## Examples

### Share a Review Session

```bash
# Export latest session to Markdown
apeironcode share latest --format markdown

# Review the file
cat .apeironcode-agent/shares/session-abc12345-2026-04-30.md

# Send to team
curl -X POST https://slack.com/api/chat.postMessage \
  -d "text=See my review: $(cat .apeironcode-agent/shares/session-abc12345-2026-04-30.md)"
```

### Archive Sessions

```bash
# Export all sessions to JSON for archival
for id in $(apeironcode session list | awk '{print $1}'); do
  apeironcode share "$id" --format json
done

# Move to archive
mkdir -p archive/sessions
mv .apeironcode-agent/shares/*.json archive/sessions/
```

### Generate HTML Reports

```bash
# Export session to HTML
apeironcode share latest --format html

# Open in browser
open .apeironcode-agent/shares/session-abc12345-2026-04-30.html
```

## Related

- [Multi-Agent Sessions](./sessions.md)
- [File Locks](./sessions.md#file-locks)
- [Architecture](./architecture.md)
