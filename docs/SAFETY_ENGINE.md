# ApeironCode Safety Engine

The ApeironCode Safety Engine is a layered defense for agent-driven actions. It
combines static command parsing, semantic risk classification, permission
modes, project trust, sandboxing, protected paths, secret egress detection,
permission rules, hooks, and completion gates.

## Components

- Shell parser (`src/safety/shell/parseCommand.ts`): structured parsing of
  shell strings (operators, redirects, subshells, env assignments) without
  executing anything.
- Command semantics (`src/safety/shell/commandSemantics.ts`): classifies a
  parsed command into risk levels (`safe` / `low` / `medium` / `high` /
  `critical`) and flags read-only / destructive / network / package-mutation
  / credential / remote-script characteristics.
- Permission modes (`src/safety/permissionModes.ts`): `default`, `plan`,
  `accept-edits`, `safe-auto`, `strict`, `ci`, `yolo` — see
  [permissions.md](./permissions.md).
- Project trust (`src/safety/projectTrust.ts`): per-cwd trust store that
  gates loading project hooks/plugins/MCP/permissions.
- Sandbox fallback policy (`src/sandbox/manager.ts`): `never` /
  `safe-readonly` / `always` — see [sandbox.md](./sandbox.md).
- Protected paths (`src/safety/protectedPaths.ts`): classifies sensitive
  paths (credentials, system, vcs, ci, lockfiles).
- Secret egress detection (`src/safety/secretEgress.ts`): flags commands
  that would exfiltrate `.env`, SSH keys, or credentials over the network.
- Permission rules (`src/safety/permissionRules.ts`): user-configured
  `allow:`/`deny:`/`ask:` rules with tool/command/path/risk/domain matchers.
- Completion gates (`src/agent/completionGates.ts`): final-turn checks that
  block or warn when the agent appears to finish prematurely.
- Hook v2 (`src/hooks/v2/`): structured event bus for `PreToolUse`,
  `PostToolUse`, `PermissionRequest`, etc. — see [hooks.md](./hooks.md).

## Phase 16B: Runtime Integration

The Phase 16A safety modules are now wired into the live agent runtime:

- Completion gates evaluate before the final assistant response when the
  loop reaches natural completion (no more tool calls). Feedback is appended
  to the final message when any gate fails.
- Hook v2 runtime producers (`src/agent/hookRuntime.ts`) emit
  `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, and `Stop` events
  into `globalHookRunner` around every tool execution and at run end.
  A hook returning `block` or `deny` for `PreToolUse` prevents the tool
  from running and surfaces a tool-error result.
- Tool batch summaries (`src/agent/toolBatchSummary.ts`) condense
  multi-tool iterations into compact, redacted summaries.
- The context viewer (`src/context/contextViewer.ts`) and compaction
  explanation (`src/context/compactionExplain.ts`) make context
  selection and compression auditable without exposing raw file or
  memory content.

## Related docs

- [permissions.md](./permissions.md)
- [sandbox.md](./sandbox.md)
- [hooks.md](./hooks.md)
- [security-model.md](./security-model.md)

## Invariants

- Safety parsers never execute commands or evaluate code.
- Warning and summary formatters never echo file contents or full secret
  values; long token-like strings are redacted.
- All agent-callable tools flow through `ToolRegistry`; the safety engine
  cannot be bypassed by tool authors.
- Defaults bias toward asking. Risky actions require explicit user consent
  unless approval mode / trust state / rule engine grants them.

### Phase 16B.1 Additions

- Tool batch summaries are emitted to the debug log after multi-tool batches
  (3+ tools, or any batch when the token budget is tight). Summaries redact
  secret-like content and never include raw file or tool output.
- `apeironcode context view` exposes `ContextViewReport` formatter on the
  CLI. With no live snapshot it renders a safe placeholder; secret-like
  values inside memory items are always redacted.
- `apeironcode debug compression` exposes `formatCompactionExplanation` so
  compaction decisions can be inspected without leaking raw content.
- The completion-gate `unresolved-todo` check now scans changed-text
  summaries for `TODO`, `FIXME`, `HACK`, `XXX`, `throw new Error("TODO …")`,
  and `NotImplemented` markers in addition to the explicit flag. Doctor
  reports each of these wirings under the `Safety:` prefix.
