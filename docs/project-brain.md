# Project Brain

Project Brain is an optional per-project `.apeironcode/` directory for durable workspace context. It helps long app builds continue from a shared project goal, plan, task list, decisions, verification notes, run summaries, and stable project memory.

Project Brain is not created silently. Use `apeironcode brain plan` first to preview the structure, benefits, and files. Use `apeironcode brain init --yes` only after approving the write.

## Structure

- `.apeironcode/PROJECT.md` - goal, stack, constraints, preferences, non-goals
- `.apeironcode/PLAN.md` - current objective, phases, next action, blockers
- `.apeironcode/TASKS.md` - backlog, in progress, done, verification tasks
- `.apeironcode/DECISIONS.md` - architecture decisions and tradeoffs
- `.apeironcode/REFERENCES.md` - docs, links, and local file notes
- `.apeironcode/VERIFY.md` - test/build/lint commands and latest validation
- `.apeironcode/RUNS.md` - concise run summaries
- `.apeironcode/MEMORY.md` - stable project facts, conventions, gotchas
- `.apeironcode/manifest.json` - versioned, redaction-safe metadata

Optional workflow folders:

- `.apeironcode/agents/`
- `.apeironcode/skills/`
- `.apeironcode/commands/`
- `.apeironcode/runs/`
- `.apeironcode/references/`

## CLI

- `apeironcode brain plan` previews files and writes nothing.
- `apeironcode brain init --yes` creates missing files and preserves existing files.
- `apeironcode brain status` shows Project Brain health.
- `apeironcode brain show` shows a safe summary.
- `apeironcode brain tasks` shows `TASKS.md`.
- `apeironcode brain memory` shows `MEMORY.md`.
- `apeironcode brain update --yes --summary "..."` appends a short run summary when `RUNS.md` exists.

## VS Code

The extension exposes:

- `ApeironCode: Plan Project Brain`
- `ApeironCode: Initialize Project Brain`
- `ApeironCode: Show Project Brain`
- `ApeironCode: Show Project Plan`
- `ApeironCode: Show Project Tasks`
- `ApeironCode: Continue Current Plan`

Initialization asks for confirmation before writing.

## Safety

Project Brain files are markdown data and workflow definitions. ApeironCode does not execute scripts from `.apeironcode/`. Project agents, skills, and commands still respect project trust and normal permission rules. Untrusted projects can show safe summaries, but behavior-changing workflow files are not auto-loaded.

Existing files are preserved by default. Secrets are redacted before summaries enter CLI output, bridge messages, context, or memory retrieval.

## Persistent Preview Store (Phase 16G.2)

Sync previews are saved to `.apeironcode/runs/sync-previews/` before any write occurs. The store:

- Holds up to 10 previews per project.
- Redacts secrets from all stored content.
- Flags previews older than 7 days as stale.
- Requires `approved:true` before any preview is applied.

Use `apeironcode brain previews` to list, inspect, and apply saved previews from the CLI. In VS Code, open the **Sync Previews** panel for a full UI.

## PLAN/TASKS Merge Engine (Phase 16G.2)

The merge engine produces a diff-preview before touching `PLAN.md` or `TASKS.md`. Manual notes and comments in those files are preserved; only new content is appended. The preview is always shown first — no silent rewrites.

## Token-Efficient Context Planner (Phase 16G.2)

The brain context planner selects files relevant to the current prompt rather than loading the full `.apeironcode/` directory. This limits token usage while keeping the agent focused on the right context.

## Agent Routing (Phase 16G.2)

`apeironcode brain route "<prompt>"` analyzes the prompt and selects the most suitable built-in agents and project skills. It explains the routing decision without executing anything.

## Large App Orchestration (Phase 16G.2)

`apeironcode brain orchestrate "<prompt>"` generates a full orchestration plan for a large app build:

- Product vision and clarifying questions (max 3).
- Stack detection and architecture outline.
- Phased build plan with per-phase tasks.
- Suggested agents and skills per phase.
- Verification strategy, risk list, first 3 next actions.
- Token strategy for long builds.

This is **deterministic planning**, not autonomous execution. No files are written until you explicitly approve initialization via `--yes` or the VS Code confirmation dialog.

## VS Code Brain Views (Phase 16G.2)

**Project Brain Panel** — central control center with all brain actions. Access via `ApeironCode: Open Project Brain Panel`.

**App Build Plan View** — rich display of orchestration results: vision, stack, phases/tasks, suggested agents/skills, verification plan, risks, token strategy, and action buttons. All writes require VS Code confirmation dialog.

**Sync Previews View** — list, inspect, and apply saved sync previews. Stale previews (>7 days) are flagged. Applying requires explicit confirmation. Secrets are redacted in the display.

## CLI Brain Commands (Phase 16G.2)

- `apeironcode brain route "<prompt>"` — route a prompt to agents/skills.
- `apeironcode brain context "<prompt>"` — preview token-efficient context selection.
- `apeironcode brain orchestrate "<prompt>"` — generate a large app build plan.
- `apeironcode brain previews` — list saved sync previews.
- `apeironcode brain previews apply <id> --yes` — apply a saved preview with explicit approval.

## Runtime Brain Intelligence (Phase 16H)

Project Brain is now automatically active during normal agent runs. No extra commands required.

### How it works

When you send a prompt, the agent:

1. **Classifies intent** — deterministic keyword matching (<1ms), no provider calls. Intents include `continue`, `large-app-build`, `debug-fix`, `test-fix`, `review`, `architecture`, `frontend`, `backend`, `docs`, `release`, and `general-coding`.
2. **Checks brain presence** — if `.apeironcode/` exists, reads a token-efficient summary.
3. **Selects context** — picks only the relevant brain files for the intent (default: 900-token budget).
4. **Injects context** — compact, redacted text is appended to the system prompt before the agent runs.
5. **Auto-syncs after run** — if the brain is present and changes were made, a safe sync is attempted automatically.

### CLI visibility commands

```
apeironcode brain runtime "<prompt>"  — show intent classification and injection preview
apeironcode brain explain "<prompt>"  — show full debug explanation of context selection
```

### VS Code

- **`ApeironCode: Brain Runtime Context`** — analyze a prompt's runtime intent and context.
- **`ApeironCode: Brain Context Explanation`** — see detailed context selection debug info.
- An information notification appears when brain context is injected (shows intent and estimated token cost).

### Token efficiency

The runtime context injector respects a configurable token budget (default 900 tokens). For simple prompts (≤6 words, no intent signal), the brain is skipped entirely — zero overhead.

### Secrets

All brain content — status lines, injections, debug output — passes through `redactProjectBrainText()`. Tokens ≥32 chars matching `[A-Za-z0-9_-]{32,}` are redacted.

## Limitations

Project Brain improves continuity, but it is not a replacement for validation. Keep `VERIFY.md` current, review generated plans, and run focused tests after changes.

Orchestration produces a deterministic plan. Agents still follow normal permission rules and require approval for file writes. There is no silent autonomous execution.

For large full-stack app requests, the real coding loop uses Project Brain as a
continuation surface, not as an automatic write target. The agent first creates
a phased build plan and asks before starting phase 1. `.apeironcode/` plan,
task, and run files are written only when the user approves that workflow.
