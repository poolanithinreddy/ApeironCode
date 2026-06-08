# Contributing to ApeironCode

Thanks for your interest in ApeironCode — an open-source, local-first AI coding
agent for the terminal. The project is **early alpha** and actively dogfooded,
so contributions, bug reports, and dogfood findings are all welcome.

## Project status

Early alpha. Interfaces, prompts, and the TUI are still evolving. Expect rough
edges; please report them (see [SECURITY.md](./SECURITY.md) for anything
security-sensitive).

## Setup

1. Install Node.js **18.18 or newer**.
2. `npm install`
3. `npm run build`
4. (optional) `npm link` to run the `apeironcode` CLI locally.
5. Copy `.env.example` to `.env.local` and add a provider key, or run
   `apeironcode setup --provider mock` to try it with no key.

## Development commands

```bash
npm run dev          # run the CLI/TUI from source (tsx)
npm run build        # bundle with tsup
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint .
npm run format       # prettier --write .
```

## Testing

```bash
npm test                    # unit + integration (offline, deterministic)
npm run test:e2e            # end-to-end agent flows
npm run test:acceptance     # e2e + integration acceptance
npm run check:file-size     # enforce the file-size limits
npm run smoke:dogfood       # scripted dogfood, no API credits
npm run smoke:master-dogfood
npm run smoke:terminal-ux
```

Default tests are **offline and deterministic**: scripted streaming chunks,
mocked connectors, temp workspaces, redacted logs. No provider/connector API
keys are required and no real network calls are made.

## Coding standards

- **TypeScript strict.** Avoid `any`.
- **File size:** keep files under 600 lines; prefer 250–350. `npm run
  check:file-size` enforces this.
- Keep changes narrow and production-focused; add/update focused tests for
  behavior changes.
- Keep slash commands in the shared registry, not inline in `App.tsx`.
- Document new commands, providers, or safety rules in `docs/`.

## Architecture invariants (do not break)

- Use `provider.stream()` / `ProviderStreamChunk`. **Do not** reintroduce
  `provider.chat()`.
- **Do not** reintroduce XML tool directives as the production path.
- All agent-callable tools go through `ToolSchema` and the `ToolRegistry`. Do
  not bypass the registry for tool execution.
- Approval is required before file writes and shell commands. Never write files
  or run commands silently.
- Reads are low-risk; writes/commands are approval-gated; dangerous
  paths/commands are blocked or escalated.
- Never leak secrets in logs, traces, tests, snapshots, CLI/doctor output, or
  tool results.
- Keep normal-mode output clean; detailed internals are debug-only
  (`--verbose` / `APEIRONCODE_DEBUG=1`).

See [docs/ai/ARCHITECTURE_INVARIANTS.md](./docs/ai/ARCHITECTURE_INVARIANTS.md).

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] relevant smoke passes (e.g. `npm run smoke:dogfood`)
- [ ] `npm run check:file-size` passes
- [ ] no secrets added (keys via env vars only)
- [ ] docs updated if behavior changed
- [ ] normal-mode output stays clean; debug details still available
- [ ] approval/tool-execution safety preserved (no `provider.chat()`, no XML
      tool path, ToolRegistry only)

## Clean-room boundary

ApeironCode is an independent clean-room implementation. Do not inspect or
derive from leaked or proprietary code from any other coding agent.
