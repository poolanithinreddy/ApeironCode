# Sandbox

ApeironCode Agent does not currently provide OS-level command sandboxing.

The Phase 18 sandbox surface is an honest detection and status layer:

```bash
apeironcode sandbox status
apeironcode sandbox doctor
```

It checks whether optional backends such as Docker, Podman, or Firejail appear available, then reports current limitations. Agent tools still run in the local process unless a future sandbox runner is explicitly implemented and enabled.

Current limits:

- No OS sandboxing for command execution.
- No per-subagent credential isolation.
- No cloud or distributed execution.
- Provider credentials are inherited from the current environment.

## Fallback Policy (Safety Engine 2.0)

When the preferred sandbox backend is unavailable, ApeironCode consults the
`sandbox.fallbackPolicy` config option:

| Policy           | Behavior |
|------------------|----------|
| `never`          | Refuse to execute any command without a sandbox. |
| `safe-readonly`  | Allow only commands classified as read-only and non-network. (default) |
| `always`         | Run locally with a warning; risky commands generate a stronger warning. |

The decision is made via `getSandboxFallbackDecision(semantics, policy)` in
`src/sandbox/manager.ts`. Read-only / non-network classification reuses the
shell command parser and semantics module. There is no silent fallback in
`safe-readonly` or `never` modes.

