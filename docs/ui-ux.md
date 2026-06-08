# ApeironCode UI/UX System

ApeironCode uses a shared product language across the terminal CLI and VS Code extension: calm surfaces, clear status, explicit permissions, and local-first trust signals.

## CLI Welcome

Interactive `apeironcode` starts with a **compact home** by default: ApeironCode
version, workspace, the configured `provider/model` (e.g.
`github-models/openai/gpt-4.1`), Project Brain status, and a short prompt hint.
It does not render the full subsystem dashboard, verbose branding, or
`mock-coder` once a real provider is configured.

The full boxed welcome dashboard is opt-in via `apeironcode --welcome` (or
`/dashboard` inside the TUI). One-shot commands such as `apeironcode "fix
tests"` stay plain and script-friendly. Direct commands (`setup`, `doctor`,
`--help`, `--version`, `provider list`) never enter the TUI and exit cleanly.
The compact home shows the configured `provider/model` and `Use /setup to
change provider` — never a "setup needed" tip once a real provider is set.

Simple actions (create/rename a file, create a folder, scaffold a plain
HTML/CSS/JS web app or web application, list, project tree, run a command) are executed
provider-free: a one-line plan, approval before any write/command, then a
concise result. Examples: `create a file named hello.md in the root` and
`create a simple modern web application using HTML CSS JS`. The static
scaffold approval names the three targets (`index.html`, `styles.css`,
`app.js`) and the success message ends with `open index.html`. They never
list unrelated source files, never inject memory-graph facts, and never call
the model. When the model path is used, OpenAI-compatible tool schemas are
sanitized before provider send so empty-object tools do not produce noisy
schema dumps.
Provider payload-too-large
(413) and similar failures stop after one clear concise message — no retry
spin.

When a provider call fails before producing content (auth, 400 payload), the
in-flight assistant block is replaced by a single clean error block: no
repeated empty `ASSISTANT` sections, no persisted spinner glyph, no retry
spin, and no memory-save prompt.

## Browser / rendered-UI smoke (Phase 18A)

For visual/layout repair prompts (`premium`, `iPhone-like`, `polished`,
`layout`, `overflow`, `responsive`, `not visually good`, `ui/ux is bad`), the
coding runtime runs a **rendered-page smoke** after applying the file plan and
reports the result honestly in the final summary (`Browser smoke: passed` /
`failed: ...`, plus `Open <entry>.html`). It must never claim a premium UI
passed when the rendered page is broken.

The smoke loads the *actual* entry HTML the user opens and *only* the CSS/JS it
links, then applies DOM/CSS heuristics (no browser, no network — deterministic
offline). It flags: display overflow, missing linked CSS/JS, editing a file the
entry does not link (e.g. root `styles.css` while the opened entry is
`calculator/index.html`), an unbounded container, and — for iPhone requests —
missing 4-column grid / orange operators / circular buttons.

Limitations (honest): the smoke is **report-only** — it adds no provider or
tool calls and does not auto-rewrite files (a concrete correction directive is
appended for the user/model to act on). Package/framework apps (Next.js, Vite)
are reported as `Browser smoke: skipped (package app)` because a real rendered
smoke needs a build + headless browser, which is intentionally out of the
default offline path. The heuristics catch obviously-broken UI and missing
linked files; they do not judge visual art.

## Actual displayed-file detection (Phase 18A)

`detectStaticAppEntry` deterministically resolves which `index.html` the user
is viewing: an explicitly named `*.html` wins, then `index.html` inside an
explicitly mentioned subfolder, then the most-recently-modified `index.html`
(nested app folder preferred over the workspace root). `resolveLinkedAssets`
then reads the CSS/JS that entry links. The runtime edits the linked files and
the final summary says exactly which file to open.

## No-op (+0/-0) write reporting (Phase 18A)

A planned write whose content is byte-identical to the file on disk is reported
as a **no-op (unchanged) file**, not counted as a real change, and not written.
The execution summary distinguishes `Files changed:` from `No-op (unchanged)
files:` so a model that returns only trivial diffs is not mistaken for progress.

## Theme

The default palette is Deep Graphite with Electric Teal, Soft Violet, and accessible status colors. The CLI respects `NO_COLOR`, `CI`, non-TTY output, and narrow terminals.

Config options:

```json
{
  "ui": {
    "theme": "auto",
    "welcome": true,
    "compact": false,
    "showTips": true,
    "showWhatsNew": true
  }
}
```

`ui.theme` supports `auto`, `dark`, `light`, and `no-color`.

## CLI Cards

Tool starts/results, permission requests, diff summaries, Project Brain context, tasks, and errors use compact text cards. Cards truncate huge content and redact token-like strings before rendering.

## VS Code

The extension uses shared design tokens layered on VS Code theme variables. Dark mode is the primary target, but colors defer to `var(--vscode-*)` where possible.

Polished areas:

- Chat empty state with local-first onboarding
- Connection status header
- Selected model and Project Brain status
- Selected context chip
- Tool timeline
- Permission cards with approve/deny actions
- Status bar states: disconnected, connected, running, needs permission, error, brain active
- Project Brain dashboard cards and action groups
- Build plan and sync preview panels

## Accessibility And Security

Webviews keep strict CSP and nonce usage. Dynamic content is escaped before insertion. Buttons and input controls have readable labels, and state is represented with text rather than color alone.

Secrets are never intentionally displayed. UI renderers redact common API keys, bearer tokens, GitHub tokens, Slack tokens, and env-style secret assignments.

## Known Limitations

The CLI welcome is text-only and does not attempt terminal animations. VS Code screenshots are not bundled in this repo; public docs use descriptions until a release screenshot set is produced.

## Normal vs debug terminal output (Phase 17D)

- Normal mode: clean transcript, compact tool/status lines, and a short
  footer (Files changed / Commands run / Tests run). No giant execution
  summary, token estimates, memory-graph dump, or selected-files block.
- Debug mode (`--verbose`, `APEIRONCODE_DEBUG=1`, or workflow reports): the
  full standardized execution summary is included.
- Pasted runtime errors render as a deterministic debug flow: a search step,
  inspected files, the fix plan approval card, the patch, and a build/validation
  line — not raw model tool chatter.

## Compact terminal UX (Phase 18B)

The interactive TUI normal mode is tuned to feel calm and Claude Code-like.

- **Compact status line**: a single line `ApeironCode · provider/model ·
  workspace · status` (e.g. `ApeironCode · openai/gpt-4o · calculator-test ·
  ready`). Statuses are normalized to user-facing labels (`ready`, `thinking`,
  `planning`, `awaiting approval`, `applying`, `validating`). Low-level fields
  (`brain:`, `bridge:`, `perm:`, `tokens:`, session/lock counts) only appear in
  debug mode. The `mock` provider renders as `mock · testing only`.
- **Compact tool cards**: each tool call is one calm line, not a bordered box —
  `✓ Read calculator/index.html`, `✓ Write calculator/styles.css  +42/-12  ·
  /revert e7`, `✓ Run npm run build`, `✗ Read read_file requires path`. Tool
  names are humanized (`write_file` → `Write`). Normal mode shows a `+N/-N`
  diff summary and a compact `/revert <id>` hint — never the raw diff, raw tool
  args/results, the `[builtin]` source tag, or the `Tool Activity` header.
- **Approval cards**: file-plan approval shows the title, message, `Risk:`, and
  the clean `Plan / Files / Commands / Validation` body that lists the actual
  targets, then `y = approve · n = deny`. There is no nested duplicate review
  box and no misleading `Files affected: none` line (the affected files are
  derived from the plan when not passed explicitly). Command approval shows the
  command, risk, and reason. Secrets are redacted; denial does nothing.
- **Final summary**: normal mode stays short and does not duplicate a
  `Files changed:` line the file-plan execution summary already rendered.

### Viewing full details

- Run with `--verbose`, set `APEIRONCODE_DEBUG=1`, or use a workflow report to
  switch the whole TUI into debug mode: full bordered tool cards with raw diffs
  and metadata, the detailed approval review panel, the full status bar with
  internal fields, and the standardized execution summary.
- Reverting an edit: each write reports a compact `· /revert <edit-id>` hint;
  run `/revert <edit-id>` to undo it.

### Known limitations

- The Ink components are validated through their pure view-models
  (`renderToolLine`, `renderCompactStatusLine`, `formatApprovalReview`,
  `buildConciseFinalSummary`) rather than a live terminal renderer, because the
  project does not depend on `ink-testing-library`.
- Interactive TUI debug toggling uses `APEIRONCODE_DEBUG=1`; the `--verbose`
  flag primarily controls one-shot/run output.
