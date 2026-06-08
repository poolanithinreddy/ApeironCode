# Skills

ApeironCode supports two kinds of skills:

1. **Built-in skills** — stored in `.apeironcode-agent/skills/` (managed via `apeironcode skill *` commands).
2. **Markdown project skills** — stored in `.apeironcode/skills/<name>/SKILL.md` (Phase 16C).

## Markdown Project Skills

Define reusable skill instructions in your project without writing TypeScript.
Project Brain uses the same `.apeironcode/skills/<name>/SKILL.md` format when
you add project-specific skills manually.

### Directory layout

```
.apeironcode/
  skills/
    react-performance/
      SKILL.md
    security-review/
      SKILL.md
      references/
        checklist.md
```

### SKILL.md format

```markdown
---
name: react-performance
description: Helps optimize React rendering and bundle performance.
whenToUse: React performance, slow components, memoization, bundle size
allowedTools: [read_file, grep_search, edit_file, test_runner]
tokenBudget: 1200
progressiveDisclosure: true
references: [references/checklist.md]
scripts: []
---

Use this skill when optimizing React rendering:

1. Check for unnecessary re-renders using React DevTools.
2. Add React.memo() to expensive pure components.
3. Use useMemo/useCallback for expensive computations.
```

### Frontmatter fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Required. Unique skill name. |
| `description` | string | Required. What the skill does. |
| `whenToUse` | string | Keywords/phrases that trigger skill selection. |
| `allowedTools` | array | Tools this skill may suggest. |
| `disallowedTools` | array | Tools this skill must not suggest. |
| `tokenBudget` | number | Max tokens for this skill in prompt (default: 800). |
| `progressiveDisclosure` | boolean | Load metadata first, body only when selected (default: true). |
| `references` | array | Reference files (listed, never auto-loaded). |
| `scripts` | array | Scripts (listed only; never executed in this phase). |

## Progressive Disclosure

Skills use **progressive disclosure** to minimize token usage:
- Only metadata (name, description, whenToUse) is loaded when listing skills.
- Full body is injected into the prompt only when the skill is selected as relevant.
- References are listed but **never auto-loaded**.
- Scripts are **never executed** in Phase 16C.

## Skill selection

Skills are selected automatically based on keyword matching between the user prompt
and `name`, `description`, and `whenToUse` fields. Up to 3 skills are selected by
default.

## CLI

```bash
apeironcode mdskill list
apeironcode mdskill show <name>
```

## Trust

Project skills require a trusted project to auto-load.
Run `apeironcode trust` first.

## Skill Routing from Brain (Phase 16G.2)

`apeironcode brain route "<prompt>"` includes project skills in its routing decision. Skills defined in `.apeironcode/skills/` are matched against the prompt and returned alongside suggested agents.

Example output:

```
Selected agents: coder (frontend) — React UI work
Suggested skills: react-ui, supabase-auth
```

The routing plan explains why each skill is relevant but does not inject skill content automatically. Skills still follow progressive disclosure — full body is only loaded when selected for a prompt.

## Runtime Brain Skill Selection (Phase 16H)

The runtime brain intent classifier automatically considers project skills when routing a prompt. Skills listed in `.apeironcode/skills/` appear in the `selectedAgents` field of `brain.runtime` responses and in the VS Code Runtime Brain Decision panel. No extra command needed — skill routing happens as part of every agent run when Project Brain is present.

## Known limitations

- Skills are selected via keyword matching (not semantic similarity in this phase).
- Scripts listed in `scripts:` are never executed (future phase).
- References listed in `references:` are not auto-injected (future phase).
