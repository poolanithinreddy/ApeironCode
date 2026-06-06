# Agents

ApeironCode Agent includes built-in specialist agents for team workflows:

- planner
- coder
- tester
- reviewer
- debugger
- docs-writer
- security-reviewer
- release-manager
- git-agent
- lsp-agent

Each subagent has a policy with allowed tools, denied tools, edit rights, command rights, network rights, memory-write rights, plan-approval requirements, read-only parallel-safety, and a maximum iteration budget.

## Policy Boundaries

- Planners are read/context oriented and cannot run test or edit tools.
- Reviewers and security reviewers are read/diff oriented and cannot edit by default.
- Coders can edit through the normal approval and Plan-Before-Code path.
- Testers can run build/lint/test tools and inspect outputs.
- Docs writers are scoped toward documentation changes.
- Git agents are read-first; write/commit behavior remains approval-gated.

Policies are enforced through the subagent runner and scoped tool registry. They are not a replacement for file permissions, command approval, or file locks.

## Agent Routing from Brain (Phase 16G.2)

`apeironcode brain route "<prompt>"` analyzes a natural language prompt and selects the most suitable built-in agents and project skills. It does not execute the agents — it produces a routing plan explaining which agent to use, what role it would play, and why.

Example:

```bash
apeironcode brain route "implement the login page with email and password"
# → selects: coder (frontend), tester (write auth tests)
# → suggests skill: react-ui (if defined in .apeironcode/skills/)

apeironcode brain route "review the auth module for security issues"
# → selects: security-reviewer, reviewer
```

In VS Code, use **ApeironCode: Route Prompt to Brain** or the **Route Prompt** button in the Project Brain panel.

## Commands

```bash
apeironcode agents
apeironcode agent show reviewer
apeironcode agent run reviewer "review the current diff"
apeironcode team plan "fix failing tests"
apeironcode team run "fix failing tests" --dry-run
apeironcode team run "fix failing tests" --workspace temp-copy
apeironcode team run "review auth and security" --parallel-readonly --dry-run
```

## Markdown-Defined Project Agents (Phase 16C)

You can define custom agents in `.apeironcode/agents/*.md`:

`apeironcode brain init --yes` can create starter project agents such as
`architect`, `frontend-engineer`, `backend-engineer`, `test-engineer`, and
`reviewer`. These are templates only; project trust is still required before
they auto-load.

```markdown
---
name: my-agent
description: What this agent does.
tools: [read_file, grep_search]
disallowedTools: [run_command]
permissionMode: strict
maxTurns: 8
skills: [my-skill]
memory: project
---

You are a careful agent that...
```

### Frontmatter fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Required. Unique agent name. |
| `description` | string | Required. What the agent does. |
| `model` | string | Optional model override. |
| `effort` | low/medium/high | Optional effort hint. |
| `tools` | array | Tool names this agent may use. |
| `disallowedTools` | array | Tools this agent must never use (overrides `tools`). |
| `permissionMode` | mode | Permission mode (default: `strict`). |
| `maxTurns` | number | Optional turn limit. |
| `skills` | array | Skill names to include in context. |
| `memory` | project/global/none/inherit | Memory scope. |
| `isolation` | none/sandbox | Isolation level. |
| `background` | boolean | Background agent (default: false). |

### CLI

```bash
apeironcode mdag list
apeironcode mdag show <name>
```

## Background Task Integration (Phase 16D)

Markdown agents can be launched as background tasks:

```bash
# Create a task using a named markdown agent
apeironcode task create "Review recent commits" --kind agent --agent code-reviewer --start

# Worktree-isolated agent task
apeironcode task create "Refactor auth module" --kind agent --agent code-writer --worktree --start
```

- Untrusted project agents are blocked even when `--agent` is used.
- Task records include `agentName`, `skillNames`, and `permissionMode` from the agent definition.
- See [tasks.md](tasks.md) and [worktrees.md](worktrees.md) for full documentation.

## Limitations

- Team execution is sequential and same-process.
- Parallel editing is not implemented. Phase 15 only schedules/dry-runs safe read-only lanes.
- Subagents do not yet get separate provider credentials or OS-level sandboxes.
- `git-worktree` workspace mode executes for clean local git repositories.
- Project agents require trusted project (`apeironcode trust`) to auto-load.
- Background agent task loop integration (full agent run via task) is a future phase.
