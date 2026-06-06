# Tools

The tool registry is the controlled execution surface exposed to the model.

Current tools:

- `read_file`
- `file_info`
- `list_files`
- `glob`
- `grep`
- `edit_file`
- `patch_file`
- `write_file`
- `run_command`
- `command_status`
- `command_output`
- `kill_command`
- `git_status`
- `git_branch`
- `git_log`
- `git_diff`
- `git_commit`
- `git_pr_description`
- `test_runner`
- `lint_runner`
- `build_runner`
- `package_info`
- `project_tree`
- `todo_write`

Each tool provides:

- a stable name and description
- a Zod input schema
- a risk level
- approval metadata
- a `run()` implementation

The current prompt protocol still allows one tool call per model turn, but coding tasks use a safer file-plan protocol: the model returns structured JSON describing file operations and commands, then the runtime validates, previews, requests approval, and executes through ToolRegistry-backed tools.
## Provider-free deterministic simple actions

Obvious filesystem/command requests are executed directly through the
ToolRegistry with deterministic, valid arguments — no model call, no project
context build, no memory injection, no unrelated file selection:

- `create a file named hello.md in the root` → `write_file {path:"hello.md",content:""}` (asks approval; refuses to overwrite an existing file)
- app-build prompts such as `Build a task manager web app using HTML CSS JS` → provider-generated file plan, approval preview, then `write_file` creates `index.html`, `styles.css`, and `app.js`
- `rename README.md to read.md` → approval-gated, path-guarded `fs.rename` (no overwrite)
- `create a folder named docs` → approval-gated `mkdir`
- `show project tree` / `list files` → `project_tree {}` (no approval)
- `run npm test` → `run_command` (asks approval)

Mutating actions still require approval; read-only ones do not. Reading a
single file and any compound/multi-step request ("read X, replace Y, run
tests") stay on the model loop. This path is faster, cheaper, and reliable:
the model never has to construct tool arguments, so missing-`path`/`content`
errors and 413 payloads cannot happen for these requests. App-building prompts
are intentionally not canned templates; the model generates the app-specific
file plan, while the runtime owns safe execution.

## Tool execution contract

Every tool call passes through a single contract (`normalizeToolCall`,
`validateToolInput`, `formatToolInputError`, `shouldRetryToolInputError`)
before execution:

- `read_file` requires `path`; `write_file` requires `path` + `content`;
  `edit_file` requires `path` + `search` + `replace`; `run_command` requires
  `command`; `todo_write` requires `todos`; `project_tree` accepts no args
  (empty/`null` input is normalized to `{}`).
- The contract only enforces fields the tool's registered schema actually
  requires, so a tool whose schema accepts `{}` is never falsely rejected.
- Errors are tool-specific and concise (e.g. `read_file requires path`) and
  never reference another tool. `APEIRONCODE_DEBUG=1` adds the missing-field
  list. Missing-required-field errors are not retried with the same call.

## todo_write restriction

`todo_write` is **not** exposed to the model by default. It is offered only in
explicit planning/task-management contexts (e.g. "break this into a todo list /
checklist", or plan mode). During app build/run/fix flows it is never exposed,
and a malformed `todo_write` is skipped (debug-logged only) — it never fails
the task or is saved to memory.

## Run-app command resolution

`package_info`/`package.json` scripts drive deterministic command resolution:
`dev` → `npm run dev`, `start` → `npm start`, build/fix → `npm run build`,
prefixed with `cd <appDir> && ` for nested apps. Commands always require
approval; the runtime never calls `run_command` without a command.

## command_output exposure

`command_output` needs a real background-command `sessionId`. It is no longer
exposed to the model by default; it is offered only when a background command
session is active (or in `full` tool mode). This removes the
`command_output requires sessionId` failure during ordinary debugging.

## File-plan visual repair & no-op writes (Phase 18A)

`buildFilePlanPrompt` appends a **premium-UI repair directive** when the prompt
is a visual/layout task (`premium`, `iPhone`, `polished`, `layout`, `overflow`,
`responsive`, `not visually good`, `ui/ux is bad`): full layout correction (not
color-only), HTML structure updates when needed, comprehensive CSS, preserved
JS, no overflow, correct linked CSS/JS paths, modern tokens, a bounded
mobile-like container, and a closing "how to open/run" line.

The file-plan executor compares each planned write against the file on disk; a
byte-identical write is recorded in `noopFiles` (`+0/-0`), is not counted as a
real change, and is not written. The execution summary separates `Files
changed:` from `No-op (unchanged) files:`.

After applying a visual file plan, the runtime runs the offline browser smoke
(`runBrowserSmoke`) and appends an honest `Browser smoke: passed/failed` line
plus the entry-open hint; on failure it appends a concrete correction directive
naming the failing checks and the entry file to edit.
