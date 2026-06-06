# Multi-Agent Sessions

ApeironCode Agent supports multi-agent sessions: process-local records of agent work that track files changed, commands run, tests executed, and file locks held during agent execution.

## Overview

Sessions are **local only**. They are stored in `.apeironcode-agent/sessions/` as JSON records. There is no background daemon, no live interactive attach (yet), and no cloud upload.

Sessions enable:
- Tracking agent work across multiple invocations
- Preventing concurrent modifications to the same file (via advisory file locks)
- Exporting session reports (Markdown, JSON, HTML) for review
- Resuming work from a previous state

## Session Lifecycle

Each session moves through states:

```
queued → running → paused → completed
             ↓
           stopped
             ↓
           failed
```

### Queued

Session is created but not yet executed. The agent has not started.

**Command**: `apeironcode session start <goal> --no-run`

### Running

Agent is actively executing. The session tracks files changed, commands run, and tests executed in real time.

**Command**: `apeironcode session start <goal>`

### Paused

Execution is temporarily suspended. No new work is recorded until resumed.

**Command**: `apeironcode session pause <id>` (not yet fully wired in this phase)

### Completed

Agent execution finished successfully. Session records are finalized.

**Initiated by**: Agent completing without error

### Stopped

Session was forcibly stopped (e.g., user interrupt). Any acquired locks are released.

**Command**: `apeironcode session stop <id>`

### Failed

Agent execution failed. Error message is recorded.

**Initiated by**: Agent encountering fatal error or explicit failure

## Commands

### Create a Queued Session

```bash
apeironcode session start "review auth module" --no-run
```

Output: Session ID and status

```
Session queued: abc12345 | review auth module
```

### List Sessions

```bash
apeironcode session list
```

Shows all sessions for the current project:

```
session-id | status   | goal                    | created
abc12345   | queued   | review auth module      | 2026-04-30 21:30:00
def67890   | running  | fix login bug            | 2026-04-30 21:35:00
```

### Show Session Details

```bash
apeironcode session show <id>
```

Displays:
- Session metadata (ID, goal, mode, provider, model)
- Timeline (created, started, stopped/completed)
- Work summary (files changed, commands run, tests executed, locks held)
- Linked task ID (if any)

### Stop a Session

```bash
apeironcode session stop <id>
```

Marks session as stopped and releases all acquired file locks.

### View Active Locks

```bash
apeironcode session locks
```

Lists all files currently locked by any session.

```
file                  | locked by      | goal
src/auth.ts           | abc12345       | review auth module
src/login.spec.ts     | abc12345       | review auth module
```

### Attach to a Session

```bash
apeironcode session attach <id>
```

**Status**: Experimental. Currently shows a summary view of the session. Does not provide live interactive console access. See [Limitations](#limitations).

## Session Tracking

### Files Changed

Tracked automatically when tools like `edit_file`, `write_file`, or `patch_file` succeed.

```bash
apeironcode session show <id>
# Output includes: Files Changed: src/auth.ts, src/login.spec.ts, ...
```

### Commands Run

Tracked automatically when `run_command` executes successfully.

```bash
apeironcode session show <id>
# Output includes: Commands Run: npm test, git commit -m "...", ...
```

### Tests Run

Tracked automatically when test-like commands execute (e.g., `npm test`, `pytest`, `cargo test`).

```bash
apeironcode session show <id>
# Output includes: Tests Run: tests/auth.test.ts, tests/login.test.ts, ...
```

### File Locks

Acquired automatically by modifying tools (edit_file, write_file, patch_file) to prevent concurrent modifications. Released when session stops, completes, or fails.

See [File Locks](#file-locks) for details.

## File Locks

File locks prevent concurrent modifications to the same file by different agent sessions within the same process.

### Protected Tools

These tools acquire locks on their target files:
- `edit_file`
- `write_file`
- `patch_file`
- `revert_patch` (releases lock)

### Unprotected Operations

These do NOT acquire locks (by design):
- `run_command` – executes arbitrary shell commands, not file modifications
- `git_commit` – records changes, does not modify file content
- `delete_file` – not yet locked (planned for future phase)

### Conflict Behavior

When a session tries to modify a file locked by another session:

```
❌ Tool execution blocked: /src/auth.ts is locked by session abc12345 (goal: review auth module)
```

The tool does not execute. The session record is NOT updated (filesChanged is not incremented).

### Lock Release

Locks are released automatically when:
- Session stops: `apeironcode session stop <id>`
- Session completes: Agent finishes without error
- Session fails: Agent encounters fatal error
- Stale cleanup: Locks older than ~24 hours (configurable)

### Same-Session Reacquisition

A session can acquire the same lock multiple times (it already holds it). This allows repeated edits without releasing/reacquiring.

```bash
# Session abc12345 locks /src/auth.ts for edit
apeironcode edit_file --path /src/auth.ts --line 10 ...
# Lock held: abc12345 → /src/auth.ts

# Same session locks /src/auth.ts again for another edit
apeironcode edit_file --path /src/auth.ts --line 50 ...
# Lock still held: abc12345 → /src/auth.ts
```

## Background Worker Mode (Phase 8)

Phase 8 enables real background worker execution for local-only detached processing.

### Starting a Background Session

```bash
apeironcode session start "fix failing tests" --background --provider mock --model mock-coder
```

Output:
```
Started background session: agent_abc123
Goal: fix failing tests
Worker PID: 12345

Watch:
  apeironcode session logs agent_abc123 --follow

Attach:
  apeironcode session attach agent_abc123

Stop:
  apeironcode session stop agent_abc123
```

### How It Works

1. **Session creation**: Session record created and stored in `.apeironcode-agent/sessions/agents/`
2. **Worker spawn**: Detached child process spawned via `apeironcode session run-worker <sessionId>`
3. **Parent returns immediately**: User gets session ID and worker PID
4. **Worker runs independently**: Agent.run executes with saved goal/mode/provider/model
5. **Event logging**: Worker logs all events to JSONL (session_started, tool_started, etc.)
6. **Completion**: Worker updates session status (completed/failed), releases locks, exits
7. **Session state**: Parent process can watch via logs/attach/show commands

### Worker Metadata

Sessions with background workers store:
- `workerPid` — Process ID of detached worker (Unix only)
- `workerCommand` — Full command used to spawn worker
- `workerStartedAt` — ISO timestamp of worker spawn
- `workerStatus` — Metadata status ('spawned', 'running', 'completed', 'failed', 'stopped')

### Limitations

- **Process-local only**: Workers must run on the same machine
- **No cloud service**: No remote scheduler, no distributed workers
- **No live interactive input**: Attach shows read-only event stream
- **Unix-like only**: `workerPid` checks work on macOS/Linux; limited on Windows
- **No auto-restart**: Worker crashes are not automatically recovered
- **Graceful stop only**: `apeironcode session stop` sends SIGTERM; no SIGKILL without `--force`

### Example Workflow

```bash
# Start background session
$ apeironcode session start "Refactor database layer" --background --provider mock --model mock-coder
Started background session: agent_abc123
Worker PID: 12345

# Watch progress
$ apeironcode session logs agent_abc123 --follow
[12:34:56] session_started: Agent session execution started
[12:35:02] tool_started: Tool edit_file
[12:35:05] file_changed: src/database.ts
[12:35:08] command_run: npm test
[12:35:20] session_completed: Agent session completed successfully

# Attach to see summary
$ apeironcode session attach agent_abc123
# Session: Refactor database layer
# Status: completed
# ...

# Review or export
$ apeironcode share agent_abc123 --format markdown
Session exported to: file:///path/to/.apeironcode-agent/sessions/shares/session-abc123-2026-04-30.md
```

## Event Logs (Phase 7)

Each session records structured event logs for audit and debugging.

### Event Log Storage

Events are stored in `.apeironcode-agent/sessions/logs/<sessionId>.jsonl`:

```json
{"id":"..","sessionId":"..","type":"session_started","timestamp":"2026-04-30T...","message":"Session started"}
{"id":"..","sessionId":"..","type":"tool_started","timestamp":"2026-04-30T...","message":"Tool: edit_file","data":{"tool":"edit_file"}}
{"id":"..","sessionId":"..","type":"file_changed","timestamp":"2026-04-30T...","data":{"file":"/src/auth.ts"}}
{"id":"..","sessionId":"..","type":"tool_completed","timestamp":"2026-04-30T...","data":{"tool":"edit_file"}}
{"id":"..","sessionId":"..","type":"session_completed","timestamp":"2026-04-30T..."}
```

### Event Types

- `session_started` — Session created
- `status_changed` — Session status transitioned (queued → running, running → paused, etc.)
- `tool_started` — Tool execution began
- `tool_completed` — Tool execution succeeded
- `tool_failed` — Tool execution failed
- `file_locked` — File lock acquired
- `file_changed` — File modified during session
- `command_run` — Shell command executed
- `test_run` — Test executed
- `permission_decision` — User approval given/denied
- `summary_updated` — Session summary written
- `session_completed` — Session finished successfully
- `session_failed` — Session encountered fatal error
- `session_stopped` — Session stopped by user

### Viewing Event Logs

```bash
# Show recent events
apeironcode session logs <id>

# Show last 20 events
apeironcode session logs <id> --tail 20

# Follow new events (experimental)
apeironcode session logs <id> --follow

# Attach shows recent events summary
apeironcode session attach <id>
```

### Event Privacy

Events are redacted using the same patterns as session exports. Secrets in command messages and event data are masked before storage.

## Limitations

### No Background Daemon

Sessions are created and managed in the current process. If the process exits, the session remains in its last recorded state (queued, running, paused, stopped, completed, or failed), but no further work is recorded until the session is resumed in a new process.

```bash
# Session starts running
apeironcode session start "review auth module"
# Process exits
# Session remains in 'running' state; no new work is recorded

# Later, resume the session in a new process
apeironcode session resume <id>
# Now work can continue to be recorded
```

### No Live Interactive Attach

`apeironcode session attach <id>` currently shows a summary view of the session. It does not provide:
- Live console output from the agent
- Interactive input to the running agent
- Real-time file change notifications

This is planned for a future phase.

### Local-Only Execution

All session tracking happens within a single machine. Sessions cannot be:
- Synced to the cloud
- Resumed on a different machine
- Shared with other users (without manual export)

### Advisory Locks

File locks are advisory. They prevent the `apeironcode` agent from modifying a locked file, but:
- External processes can still modify locked files
- Lock files are stored locally in `.apeironcode-agent/locks/`
- There is no distributed locking across multiple machines

### Redaction Limitations

When exporting sessions, secrets like API keys and passwords are redacted using pattern-based rules. However:
- Redaction is not cryptographically guaranteed
- Complex or obfuscated secrets may not be detected
- Manual review is recommended before sharing exports

See [Redaction](#redaction) for details.

## Redaction

Session exports redact secrets using these patterns:

```
api_key=... → api_key=[REDACTED]
Bearer token-abc123 → bearer [REDACTED]
password=... → password=[REDACTED]
token=... → token=[REDACTED]
Authorization: ... → authorization=[REDACTED]
EXPORT_VAR=... → [REDACTED VALUE]
-----BEGIN [RSA|DSA|EC|PGP] ... -----END ... → [REDACTED PRIVATE KEY]
```

Command history is redacted before export. Use `--format json` to inspect the redaction in detail.

## Related

- [Sharing Sessions](./share.md)
- [File Locks & Concurrent Modification](../CONTRIBUTING.md)
- [Agent Architecture](./architecture.md)
