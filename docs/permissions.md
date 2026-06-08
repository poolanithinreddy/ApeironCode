# Permissions

ApeironCode Agent uses explicit allow and deny rules to control risky operations.

Supported action types:

- `FileRead`
- `FileEdit`
- `FileWrite`
- `Bash`
- `Tool`
- `Network`

## Rule Syntax

```text
Allow(ActionType(pattern))
Deny(ActionType(pattern))
```

Examples:

```text
Allow(Bash(npm test))
Allow(FileEdit(src/**))
Allow(Tool(plugin:echo.*))
Allow(Network(https://duckduckgo.com/*))
Deny(Network(http://127.0.0.1:*))
Deny(Bash(rm -rf *))
```

## Resolution Order

- `Deny(...)` takes precedence over everything else.
- `Allow(...)` skips the approval prompt for matching operations.
- No match falls back to ask-first behavior.

That means web access is conservative by default even when the web tools are enabled. A user can allow the tool itself and still require an approval prompt for the outbound target unless a matching `Network(...)` allow rule exists.

## Command Surfaces

CLI:

```bash
apeironcode permissions list
apeironcode permissions add "Allow(Network(https://duckduckgo.com/*))"
apeironcode permissions remove "Allow(Network(https://duckduckgo.com/*))"
apeironcode permissions check "Tool(web_fetch)"
```

TUI:

```text
/permissions list
/permissions add Allow(Network(https://duckduckgo.com/*))
/permissions remove Allow(Network(https://duckduckgo.com/*))
```

## Network Rules

`Network(...)` rules are used by web tools and any other tool that declares outbound targets.

Examples:

- Allow a public search provider:
  `Allow(Network(https://duckduckgo.com/*))`

- Allow a single trusted domain for direct fetches:
  `Allow(Network(https://example.com/*))`

- Explicitly block loopback access:
  `Deny(Network(http://127.0.0.1:*))`

- Keep local testing narrow when `web.allowPrivateHosts=true` is enabled:
  `Allow(Network(http://127.0.0.1:4312/*))`

## Approval Modes

- `ask`
  Default interactive behavior.

- `auto-read`
  Low-risk project reads can proceed automatically.

- `trusted`
  In-project reads and writes can auto-approve, but external command-like actions remain conservative.

- `trusted-workspace`
  Similar trust model for trusted workspace flows.

- `bypass`
  Skips approvals entirely. Use only in trusted automation.

## Audit and Limits

- Permission decisions are recorded in the audit log.
- The parser and matcher do not currently support nested boolean logic or rule groups.
- Pattern matching is glob-like rather than full regular expressions.

## Permission Modes (Safety Engine 2.0)

Permission modes (`src/safety/permissionModes.ts`) provide a coarse global
default on top of the rule engine:

| Mode            | Reads | Writes | Shell           | Network | Destructive |
|-----------------|-------|--------|-----------------|---------|-------------|
| `default`       | allow | ask    | ask             | ask     | ask         |
| `plan`          | allow | deny   | deny            | deny    | deny        |
| `accept-edits`  | allow | allow  | ask             | ask     | ask         |
| `safe-auto`     | allow | ask    | allow read-only | ask     | deny        |
| `strict`        | allow | ask    | ask             | ask     | deny        |
| `ci`            | allow | deny   | deny            | deny    | deny        |
| `yolo`          | allow | allow  | allow           | allow   | ask         |

Risky shell commands downgrade `safe-auto` to `ask` and downgrade `yolo` to
`ask` for `critical` risk.

## Rule Engine v2 Format

In addition to legacy `Allow(...)` / `Deny(...)` rules, the v2 string format
supports compact matchers:

```
allow:tool(read_file)
deny:command(rm:*)
deny:path(.env)
deny:risk(credential-risk)
allow:domain(github.com)
```

Resolution: any `deny` wins, then `ask`, then `allow`. Dangerously broad
rules (`allow:tool(*)`, `allow:command(sudo:*)`) are flagged at parse time.