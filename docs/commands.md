# Commands

ApeironCode supports **Markdown-defined project commands** stored in
`.apeironcode/commands/*.md`.

Commands render a prompt (with `{{args}}` substitution) and pass it to the agent.
No arbitrary code or shell is executed from command definitions.

Project Brain initialization can create starter commands such as
`build-app`, `continue-plan`, `review-progress`, and `fix-tests`; they follow
the same trust and permission rules as hand-written project commands.

## Format

```markdown
---
name: review-pr
description: Review current branch and prepare PR notes.
aliases: [pr-review, pr]
argumentHint: "[base-branch]"
allowedTools: [git_diff, read_file, grep_search]
permissionMode: strict
requiresTrust: true
---

Review the current changes against {{args}}.
Focus on correctness, tests, and security.
Flag any missing test coverage or security issues.
```

## Frontmatter fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Required. Unique command name. |
| `description` | string | Required. What the command does. |
| `aliases` | array | Alternative names (e.g., `[pr, review]`). |
| `argumentHint` | string | Hint shown in `--help`. |
| `allowedTools` | array | Tools this command may use. |
| `permissionMode` | mode | Permission mode (default: `inherit`). |
| `requiresTrust` | boolean | If true, only runs in trusted projects. |

## Template substitution

The only substitution supported is `{{args}}`, which is replaced with the
arguments passed on the CLI. No eval, no template engines, no shell.

## CLI

```bash
apeironcode mdcommand list
apeironcode mdcommand show review-pr
apeironcode mdcommand run review-pr main
apeironcode mdcommand run pr main          # via alias
```

## Trust

Commands with `requiresTrust: true` are blocked unless the project is trusted.
Commands without `requiresTrust: true` (or with `requiresTrust: false`) can run
in any project.

Run `apeironcode trust` to trust the current project.

## CLI Brain Commands (Phase 16G.2)

The following brain commands are available at the CLI level (not project Markdown commands):

```bash
# Route a prompt to agents and skills
apeironcode brain route "<prompt>"

# Preview token-efficient context selection for a prompt
apeironcode brain context "<prompt>"

# Generate a large app build orchestration plan (no writes)
apeironcode brain orchestrate "<prompt>"

# Show runtime brain intent and injection preview for a prompt
apeironcode brain runtime "<prompt>"

# Show full debug explanation of brain context selection for a prompt
apeironcode brain explain "<prompt>"

# List saved sync previews
apeironcode brain previews

# Apply a saved sync preview (requires --yes)
apeironcode brain previews apply <id> --yes
```

These commands always preview first and never write silently. `--yes` is required for any write operation.

## Security

- No shell execution from command body.
- No template evaluation (only `{{args}}` literal substitution).
- Secrets are redacted from rendered prompts.
- `allowedTools` and `permissionMode` are enforced at the agent level.
