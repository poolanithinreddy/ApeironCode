# Troubleshooting

## `apeironcode doctor` reports Ollama unreachable

Run:

```bash
ollama serve
```

Then verify your configured base URL:

```bash
apeironcode config get baseUrl --provider ollama
```

## Cloud provider API key missing

Set the environment variable expected by the active provider, for example:

```bash
export OPENROUTER_API_KEY=...
```

Then rerun:

```bash
apeironcode provider test
```

Provider setup and recommendation output only shows whether an environment variable is set or missing. It does not print secret values.

## Fallback chain does not switch providers

Check the fallback plan:

```bash
apeironcode provider fallback coding
```

Automatic fallback is only enabled when `fallbackModel` is configured. Without that setting, ApeironCode reports candidates but does not silently switch providers.

If `localOnly=true`, cloud providers are skipped in fallback and recommendation output. Disable it or choose a local provider/model such as `ollama:qwen2.5-coder:7b` or `mock:mock-coder`.

## Ollama model is missing

ApeironCode will not pull models automatically. Use the pull hint:

```bash
apeironcode ollama recommend
apeironcode ollama pull-hint qwen2.5-coder:7b
```

Then run:

```bash
ollama pull qwen2.5-coder:7b
```

## OpenAI-compatible endpoint setup

Set a base URL and API key environment variable for your endpoint, then select the provider and model:

```bash
export OPENAI_API_KEY=...
apeironcode config set provider openaiCompatible
apeironcode config set baseUrl https://api.example.com/v1
apeironcode config set model <model>
```

ApeironCode does not support unofficial ChatGPT Plus, GitHub Copilot, browser-cookie, or subscription-login hacks.

## Interactive UI does not render correctly

`apeironcode` interactive mode expects an interactive TTY. If you are inside a non-interactive shell, use one-shot mode instead.

## Mode label does not match the prompt you typed

ApeironCode can infer an effective mode from plain chat prompts such as `Explain this repo` or `Fix failing tests`.

- one-shot CLI runs show the inferred mode in the preamble
- execution summaries and saved session metadata use the same effective mode label
- the TUI status bar reflects the last effective mode for the current run

If you need to suppress inference for a one-shot CLI run, pass an explicit mode such as:

```bash
apeironcode --mode chat "Explain this repo"
```

## Output shows structured JSON instead of a simple sentence

That is expected when a provider, tool, or error path returns a structured object instead of plain text. ApeironCode now safely renders those values as readable JSON in approval prompts, diagnostics, slash command output, and error panels so unexpected object payloads do not degrade into `[object Object]`.

## `apeironcode lsp status` reports missing servers

That means ApeironCode did not find a supported language-server binary on your `PATH` for one of the built-in languages.

Run:

```bash
apeironcode lsp status
```

Then install the missing server reported for your language. Common install commands:

```bash
# TypeScript / JavaScript
npm install -g typescript-language-server typescript

# Python
npm install -g pyright

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

See [LSP and Code Intelligence](./lsp.md) for the full built-in language list and current limitations.

## `apeironcode lsp diagnostics` returns fallback analysis

That is expected when no compatible language server is available, the server fails to start, or the server does not publish diagnostics for the file during the request window.

Run:

```bash
apeironcode lsp diagnostics <file>
```

Interpret the result by its source label:

- `source: live LSP` means a server published diagnostics in time
- `source: cached LSP` means the current process already had a valid diagnostics result for that exact file content
- `source: fallback analysis` means ApeironCode stayed safe and returned an honest fallback reason instead of hanging or crashing

## `apeironcode lsp definition` or `apeironcode lsp references` returns fallback unavailable

That means the live lookup could not run.

Common causes:

- no supported language server is installed
- the server failed to initialize for this file type
- the requested file, line, or character does not map cleanly to a symbol the server can resolve

The command should still return a reason and should not crash.

## `apeironcode lsp symbols` works, but the output falls back

That is expected for now.

`apeironcode lsp symbols <file>` will use fallback symbol extraction whenever live `documentSymbol` is unavailable. Check the `source:` line in the output. `cached LSP` means the current process reused a valid symbol answer. `fallback index` is still useful, but it is not identical to a full editor symbol tree.

## `apeironcode lsp sessions` shows no active sessions

That is expected in a fresh one-shot CLI invocation.

Long-lived LSP sessions are process-local. They stay warm while the TUI or agent process is alive, but they do not persist across separate `apeironcode ...` shell commands.

Use `/lsp sessions` inside the TUI if you want to inspect the live session pool for the running process.

## `apeironcode lsp cache` shows zero entries

That is expected until the current process has actually made one or more LSP-backed symbol, diagnostics, definition, or references requests.

The cache is also invalidated automatically after file-edit tools such as `edit_file`, `patch_file`, `write_file`, and `revert_patch` mutate a tracked file.

## Agent summaries mention fallback diagnostics

That means ApeironCode tried to enrich the prompt context for a relevant file in `debug`, `fix`, `test-fix`, `review`, or `refactor` mode, but live diagnostics were unavailable.

This is expected behavior. Missing servers do not break the run. The fallback note is there to prevent the agent from over-claiming live diagnostics coverage.

## Need a reminder of workflow commands

Run:

```bash
/commands
```

or ask for one command specifically:

```bash
/commands review
```

For typed workflow recipes:

```bash
apeironcode workflow list
apeironcode workflow show fix-tests
apeironcode workflow run fix-tests --dry-run
apeironcode workflow report <runId>
```

## Team workspace changes did not appear in my main repo

If you used `--workspace temp-copy`, this is expected. Subagents run in isolated temporary copies and the main workspace is not modified automatically.

Review and apply explicitly:

```bash
apeironcode team workspaces
apeironcode team merge-plan <teamRunId>
apeironcode team apply <teamRunId>
```

`team apply` requires approval mode `trusted` or `bypass`. Use `team discard <teamRunId>` to remove isolated workspaces.

## `--workspace git-worktree` refuses to execute

Git worktree mode requires a git repository, available `git worktree` support, and a clean tracked working tree. If it refuses to run, use:

```bash
apeironcode team run "fix failing tests" --workspace temp-copy
```

for portable isolation, or commit/stash tracked changes and retry worktree mode.

## Merge plan reports conflicts

ApeironCode compares the base snapshot, isolated workspace result, and current main workspace. Conflicts mean the main workspace changed, the isolated workspace deleted something unexpectedly, or the file is binary.

Useful commands:

```bash
apeironcode team conflicts <teamRunId>
apeironcode team conflicts <teamRunId> --file <path>
apeironcode team ignored <teamRunId>
apeironcode team resolve <teamRunId>
apeironcode team apply <teamRunId> --file <clean-file>
apeironcode team discard <teamRunId>
```

## Rename merge reports a conflict

Rename-aware merge is conservative. If the old path changed in main, or the new path already exists in main, ApeironCode reports a rename conflict and refuses to overwrite.

Useful commands:

```bash
apeironcode team merge-plan <teamRunId>
apeironcode team conflicts <teamRunId> --json
apeironcode team artifact <teamRunId> <artifactId>
```

Resolve manually in the main workspace or discard the isolated workspace.

## `doctor` reports missing sandbox or credential isolation

This is expected. ApeironCode Agent is local-first and approval-gated, but it does not provide OS-level sandboxing, per-subagent credential vaults, or cloud/distributed execution. Use external containers/sandboxes and least-privilege environment tokens when your threat model requires stronger isolation.

Conflicted files are not applied automatically.

## Session resume does not show expected history

List available sessions:

```bash
apeironcode sessions list
```

Resume a specific one:

```bash
apeironcode sessions resume <session-id>
```

## Coding task produced no files

For app-build and modification prompts, ApeironCode expects the provider to
return a valid structured file plan. If the model returns malformed JSON,
absolute paths, missing content, binary files, secrets, or unapproved deletes,
the runtime rejects the plan and writes nothing. Retry with a more specific
request, switch to a stronger coding model, or use debug mode to inspect the
file-plan validation error.

Local/Ollama models can work well, but small models may omit required JSON
fields. Cloud coding models usually produce more reliable file plans. Commands
from a plan never run without approval.

## "write_file requires path and content" on a different tool

This was a routing bug (fixed in Phase 17A): a missing-argument failure for
any tool incorrectly fell back to `write_file`'s message. All tool calls now
pass through one contract and report a tool-specific error
(`read_file requires path`, `todo_write requires todos`, …). If you still see a
generic message, run with `APEIRONCODE_DEBUG=1` for the missing-field list.
Invalid tool calls are reported once and not retried identically, so the agent
will not loop.

## "the app builds but is incomplete / just text"

App build/modify now runs a feature-acceptance check after writing files. If
required features are missing the runtime requests a correction plan (max 2)
and the final summary explicitly lists implemented vs missing features and the
validation result. It will not say the app is ready while acceptance fails. If
the app is still incomplete, say so ("the application is not complete", "there
is nothing to add", "it is just text") and it will route to the existing-app
acceptance repair flow.

## "run_command requires command" / "todo_write requires todos" during run/build

Fixed in Phase 17C. "run the application" and "run … and fix any errors" use
deterministic command resolution from `package.json` (never an empty command),
and `todo_write` is no longer exposed during build/run/fix so a malformed
`todo_write` cannot derail the task.

## Pasting a runtime error (e.g. "Cannot read properties of undefined")

Paste the raw error. ApeironCode classifies it, deterministically searches the
workspace for the offending symbol (skipping node_modules/.next/dist/.git),
reads the matched + likely files itself (never a model `read_file`), asks the
provider for a JSON fix plan, previews it, asks approval, patches via
ToolRegistry, and (for build/module/syntax errors with a build script) runs
`npm run build` to validate. It will not loop on `command_output requires
sessionId` / `run_command requires command` / `read_file requires path`, and
pasted errors are not saved to project memory.

## Pasted multi-line prompt only submitted the first line

Fixed in Phase 17G. Pasting a multi-line prompt (e.g. a 10-line bulleted
description with explicit file paths) preserves every line through to
`Agent.run()`. CRLF endings are normalized to LF; only the trailing newline is
stripped. The earlier behavior (slice at first newline and submit just that
slice) is gone.

## Detailed "Read these files then fix" prompt fell into the generic loop

Fixed in Phase 17G. A prompt that says `Read calculator/index.html,
calculator/styles.css, and calculator/script.js, then apply a complete fix`
combined with `fix the layout` / `premium` / `iPhone` no longer matches the
read-only-question branch. It routes to `modify_existing_app`, the runtime
reads the named files deterministically, and the provider gets a file-plan
prompt with `tools: []`.

## Premium calculator UI "passed acceptance" but layout was bad

Fixed in Phase 17G. For calculator apps with `premium` / `layout` / `overflow`
/ `iPhone` / `responsive` in the prompt, acceptance now requires at least
three of: bounded `max-width`, dark background, rounded buttons (`border-radius`
with a real value), `display: grid` or `flex`, `box-sizing: border-box`, and a
responsive signal (`@media`, `aspect-ratio`, `width: 100%`, `min-height:
100vh`). A single `border-radius: 4px` no longer satisfies premium-UI. Other
appKinds still use the looser single-signal check.

## "Browser smoke: failed" but the feature acceptance passed

Feature acceptance only proves the requested features exist in the file
snapshot; the **browser smoke** (Phase 18A) additionally checks the *rendered*
page. A `Browser smoke: failed` line with a correction directive means the
rendered UI is broken even though the features are present — common causes:
the display can overflow (no `box-sizing: border-box` / bounded container), a
linked CSS/JS file is missing, or you edited a file the opened entry does not
link (e.g. root `styles.css` while the app is `calculator/index.html`). Fix the
files the entry actually links, then re-run. The smoke is report-only and never
rewrites files on its own.

## My fix didn't change anything ("No-op (unchanged) files")

If the summary lists a file under `No-op (unchanged) files:` the planned
content was byte-identical to what was already on disk (+0/-0). It is not
counted as a change. Re-state the concrete change you want; for layout/premium
requests the file-plan prompt now demands a full layout correction, not a
color-only tweak.

## Browser smoke is skipped for my Next.js / Vite app

Package/framework apps report `Browser smoke: skipped (package app)`. A real
rendered smoke needs a build + headless browser, which is intentionally outside
the default offline path. Build and open the app manually to verify the UI.

## Output is too noisy / too terse

Normal mode is concise: the answer plus a short Files changed / Commands run /
Tests run footer. The full execution summary (context selection, token/cost,
memory graph, risks) is debug-only — enable it with `--verbose` or
`APEIRONCODE_DEBUG=1`.

## I want to see the full diff / raw tool details in the TUI (Phase 18B)

Normal-mode tool cards are compact one-liners and show only a `+N/-N` diff
summary — never the raw diff, raw tool args/results, or the `[builtin]` source
tag. To see full bordered cards with the complete diff, metadata, the detailed
approval review panel, and the full status bar, set `APEIRONCODE_DEBUG=1`
before launching `apeironcode`. To undo a write, use the compact
`· /revert <edit-id>` hint shown on each write card: run `/revert <edit-id>`.

## The approval card showed "Files affected: none" / nested boxes (fixed)

This is fixed in Phase 18B. File-plan approvals now show a single clean card
(title, message, `Risk:`, then the `Plan / Files / Commands / Validation` body
that lists the actual targets) and `y = approve · n = deny`. The misleading
`Files affected: none` line and the duplicate nested review box no longer
appear in normal mode (the detailed review panel is debug-only). Denying still
does nothing and secrets are redacted.
