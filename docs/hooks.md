# Hooks

Hooks let users customize lifecycle automation safely.

Config path:

```text
.apeironcode-agent/hooks.json
```

Example:

```json
{
  "hooks": [
    {
      "name": "pre-plan-note",
      "event": "before_plan",
      "type": "built-in",
      "enabled": true
    }
  ]
}
```

Supported runtime events include `session_start`, `session_complete`, `session_fail`, `before_plan`, `after_plan`, `before_tool`, `after_tool`, `tool_error`, `before_edit`, `after_edit`, `before_command`, `after_command`, `before_commit`, `after_commit`, `memory_suggested`, `skill_started`, `before_skill`, `after_skill`, and `skill_completed`.

Commands:

```bash
apeironcode hooks
apeironcode hook list
apeironcode hook show pre-plan-note
apeironcode hook test pre-plan-note
apeironcode hook events
apeironcode hook enable pre-plan-note
apeironcode hook disable pre-plan-note
```

Runtime behavior:

- Agent sessions fire session, planning, memory, and skill hooks.
- Tool registry calls fire tool lifecycle hooks, with edit, command, and commit hooks derived from the invoked tool.
- Hook executions are recorded in `.apeironcode-agent/hooks/events.jsonl`.
- Hook payloads and outputs are secret-redacted before display or persistence.
- Shell hooks are disabled by default unless configured, and even enabled shell hooks require explicit approval before execution.
- Hook failures are logged. Hooks can opt into fail-closed behavior with `failClosed: true`.

## Hook v2 Foundation

Hook v2 (`src/hooks/v2/`) introduces a structured contract that complements
the legacy hook configuration above. It is the foundation that future
plugin/permission integrations register against.

Event types:

- `UserPromptSubmit`
- `PreToolUse`, `PostToolUse`, `PostToolUseFailure`
- `PermissionRequest`, `PermissionDenied`
- `Stop`
- `FileChanged`, `CwdChanged`

Result actions:

- `continue` — proceed normally
- `warn` — append a warning, continue
- `block` — stop pre-action work
- `approve` / `deny` — for permission events
- `modifyInput` — rewrite tool input for downstream hooks
- `injectContext` — inject text into the model context

Hooks are registered with a priority (lower runs first). Block/deny
short-circuits the chain. `modifyInput` updates the event passed to
subsequent hooks. See `src/hooks/v2/runner.ts`.

## Hook v2 Runtime Producers (Phase 16B)

The agent runtime emits Hook v2 events through helpers in
`src/agent/hookRuntime.ts`:

- `emitPreToolUseHook(toolName, input, cwd)` — runs before each tool call.
  Returning `block` or `deny` prevents the tool from executing and
  surfaces an error result back into the loop.
- `emitPostToolUseHook(toolName, result, cwd)` — runs after a successful
  tool call.
- `emitPostToolUseFailureHook(toolName, error, cwd)` — runs after a
  failing tool call.
- `emitStopHook(cwd)` — runs at the end of an agent run.

Register hooks against the singleton `globalHookRunner`:

```ts
import {globalHookRunner} from 'apeironcode-agent/hooks/v2/runner';

globalHookRunner.register({
  id: 'block-rm-rf',
  events: ['PreToolUse'],
  handler: (evt) => evt.toolName === 'run_command' && /rm\s+-rf/.test(String(evt.input?.command))
    ? {action: 'block', message: 'Refusing destructive command.'}
    : {action: 'continue'},
});
```

Tests should call `globalHookRunner.clear()` in `beforeEach` to isolate
state between cases.
