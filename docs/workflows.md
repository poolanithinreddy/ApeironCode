# ApeironCode Workflows

ApeironCode supports local, Markdown-defined workflow extensibility through three
project-level directories:

| Path | What it defines |
|---|---|
| `.apeironcode/agents/*.md` | Reusable AI agents with scoped tools and memory |
| `.apeironcode/skills/*/SKILL.md` | Skill instructions loaded progressively into prompts |
| `.apeironcode/commands/*.md` | Slash-style prompts you can run from the CLI |

## Quick start

1. Create a `.apeironcode/` directory in your project root.
2. Trust your project: `apeironcode trust` (required for auto-loading).
3. Add Markdown definitions in the relevant subdirectory.
4. Use the CLI to list and inspect: `apeironcode mdag list`, `apeironcode mdskill list`, `apeironcode mdcommand list`.

For long app builds, prefer `apeironcode brain plan` first. Project Brain previews the `.apeironcode/` structure, then `apeironcode brain init --yes` creates starter agents and commands only after explicit approval.

## Trust model

Workflow files are **not** executed automatically for untrusted projects.
Project trust gates auto-loading of all three definition types.

- Commands with `requiresTrust: true` are blocked even after general project trust is granted, unless the project is trusted.
- Untrusted workflows are reported by `apeironcode doctor` as blocked.
- Temporary directories are always untrusted.

See [Security Model](./security-model.md) for details.

## Progressive disclosure

Skills use progressive disclosure:
- Only metadata (name, description, whenToUse) is loaded initially.
- Full body is injected only when a skill is selected as relevant for the current prompt.
- References listed in `references:` are **never** auto-loaded.
- Scripts listed in `scripts:` are **never** executed in this phase.

## CLI commands

```
apeironcode mdag list              # list project Markdown agents
apeironcode mdag show <name>       # show agent details

apeironcode mdskill list           # list project Markdown skills
apeironcode mdskill show <name>    # show skill details

apeironcode mdcommand list         # list project Markdown commands
apeironcode mdcommand show <name>  # show command details
apeironcode mdcommand run <name> [args...]  # render and display command prompt
```

## Large App Build Workflow (Phase 16G.2)

Use Project Brain orchestration for apps with multiple phases:

```bash
# 1. Generate orchestration plan (writes nothing)
apeironcode brain orchestrate "Build a SaaS dashboard with React, Supabase, and Stripe billing"

# 2. Review the plan output: vision, stack, phases, agents, risks, first 3 actions

# 3. (Optional) Route a specific task to the right agent
apeironcode brain route "implement the Stripe webhook handler"

# 4. Preview token-efficient context for the current phase
apeironcode brain context "complete Phase 1: Foundation"

# 5. Initialize Project Brain only after reviewing the plan
apeironcode brain init --yes

# 6. Run each phase using Continue Current Plan
# The agent reads PLAN.md + TASKS.md + RUNS.md for continuity
apeironcode "Continue the current plan using Project Brain context"

# 7. After each session, sync results
apeironcode brain sync-preview     # preview what will be written
apeironcode brain sync --yes       # apply after reviewing

# 8. Check saved previews before applying
apeironcode brain previews
apeironcode brain previews apply <preview-id> --yes
```

This workflow is **deterministic** — each command either previews or requires `--yes`. No silent writes. No autonomous execution without your explicit approval at each step.

In VS Code, the same workflow is available through the **Project Brain Panel**, **App Build Plan View**, and **Sync Previews View**, each of which shows a VS Code confirmation dialog before writing anything.

## Runtime Brain Integration (Phase 16H)

When you run any prompt, the agent automatically classifies intent and injects relevant Project Brain context without requiring any extra commands:

```
# These CLI commands let you preview the runtime behavior
apeironcode brain runtime "fix the failing auth tests"
# → intent: test-fix (80%), brain files: VERIFY.md, TASKS.md, RUNS.md, ~180 tokens

apeironcode brain explain "fix the failing auth tests"
# → full debug explanation of context selection
```

Intent classes: `continue`, `large-app-build`, `debug-fix`, `test-fix`, `review`, `architecture`, `frontend`, `backend`, `docs`, `release`, `general-coding`, `none`.

For simple prompts (≤ 6 words, no signal), brain is skipped — no overhead.

## Real Coding Agent Loop

For coding prompts, ApeironCode classifies intent before loading heavy context.
Static app builds and existing-app modifications ask the provider for a
structured file plan rather than raw tool calls. The runtime then validates
relative paths, blocks traversal/secrets/binary files, previews changes, asks
approval, writes files with ToolRegistry tools, and runs approved commands.

Large full-stack prompts enter planning mode first: the agent summarizes stack,
folders, API/client/data/auth phases, commands, and the first task. Project
Brain files are created or updated only after approval.

## Related docs

## Multi-turn pending instructions

When you open a change request without details — e.g.
`do the following changes in the web app` — the agent acknowledges and waits.
No tools or provider calls run. Your next concrete (numbered/bulleted)
instruction is merged with the pending task and run against the existing app
files via the file-plan flow (read → plan → preview → approve → write).

## Combined deterministic requests

A request like `tell me what files are in this repo and create a folder named
calendar` is decomposed into ordered sub-actions. Read-only parts run without
approval; mutating parts (folder/file creation) still require approval. One
coherent answer is produced and no provider call is made.

## App build acceptance loop

App build/modify requests run a feature-acceptance check after the file plan
is applied: requirements are extracted from the prompt (todo/calculator/generic)
and evaluated against the written files. If features are missing, the runtime
asks the provider for a correction plan that lists the exact missing features,
applies it after approval, and re-checks (max 2 iterations). The final summary
reports implemented features, missing features, and validation — it never
claims success on missing features.

## Build / run / fix

- `run the application` → resolves `cd <dir> && npm run dev` (or `npm start`,
  or `open index.html` for static), with fuzzy directory matching and approval.
- `run the application and fix any errors` / `build the app` → runs
  `npm run build` first. On success it reports the pass and a run command. On
  failure it captures output, asks for a fix file plan, applies it after
  approval, and rebuilds (max 2). No empty `run_command` is ever sent.

## Incomplete-app complaints

"the app is not complete", "there is nothing to add", "it is just text", "it is
not working", "the UI is bad" route to the existing-app acceptance repair flow
when the workspace already has app files.

## Pasted-error debugging

Paste a raw runtime/build error. ApeironCode detects it (TypeError,
ReferenceError, SyntaxError, "Cannot read properties of undefined", module not
found, Next.js build, hydration), searches the workspace for the offending
symbol, reads the matched and likely files deterministically, requests a JSON
fix plan, previews + asks approval, patches via ToolRegistry, and runs
`npm run build` to validate when applicable. No raw model
`read_file`/`run_command`/`command_output`; the error is not memorized.

## Normal vs debug output

Normal mode is concise (answer + short Files/Commands/Tests footer). Use
`--verbose` or `APEIRONCODE_DEBUG=1` for the full execution summary. Run the
offline dogfood smokes without credits: `npm run smoke:real-coding`,
`npm run smoke:error-fix`, `npm run smoke:dogfood`, `npm run smoke:tui-dogfood`,
the Phase 18A master smoke `npm run smoke:master-dogfood` (runs the static
build, premium visual repair / browser smoke, nested linked-file detection,
pasted-error fix, Next.js todo, and full-stack scaffold flows in one command),
and the Phase 18B terminal-UX smoke `npm run smoke:terminal-ux` (compact status
line, tool cards, approval card, diff policy, and normal-vs-debug boundary).

## Larger / full-stack apps (Phase 18A)

Prompts that name a stack (`full-stack`, `backend`, `Express`, `API`,
`database`, `SQLite`, etc.) and a project noun (`app`, `manager`, `tracker`,
`platform`, `dashboard`, `CRM`, ...) classify as `build_full_stack_app`. Rather
than emitting one giant fragile file dump, the runtime returns a **phased build
plan** (stack, folders, backend/API, frontend, validation + run instructions)
and writes no files until you approve phase 1. This is alpha-level scaffolding
guidance; per-phase file generation with approval is still being expanded.

- [Agents](./agents.md)
- [Skills](./skills.md)
- [Commands](./commands.md)
- [Project Brain](./project-brain.md)
- [Security Model](./security-model.md)
