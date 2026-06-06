# Providers

All providers implement the shared `ModelProvider` interface.

- `name` and `displayName` identify the provider.
- `supportsStreaming` and `supportsToolCalling` describe capabilities.
- `listModels()` fetches or falls back to known model identifiers.
- `stream()` yields response chunks when supported.

Provider families in the current implementation:

- `MockProvider` is deterministic and intended for local tests and CI.
- `OllamaProvider` uses the local Ollama HTTP API.
- `OpenAICompatibleProvider` is the reusable transport for OpenAI-style chat completion APIs.
- `OpenRouter`, `OpenAI`, `Groq`, `DeepSeek`, and `GitHub Models` are thin wrappers over the OpenAI-compatible transport.
- `GitHub Models` (`github-models`) is a first-class option: base URL `https://models.github.ai/inference`, env var `GITHUB_TOKEN`, default model `openai/gpt-4.1`. Users do not need to configure "OpenAI-compatible" manually.
- `GeminiProvider` uses Google Generative Language `generateContent`.
- `AnthropicProvider` uses the Anthropic Messages API.

API keys are resolved from environment variables. Raw secrets are not stored in the local config file.
ApeironCode does not reuse ChatGPT Plus, GitHub Copilot, browser cookies, or other subscription logins as provider credentials.

Provider routing adds a second layer above raw provider implementations.

- `src/providers/modelCatalog.ts` stores known model roles, capabilities, context windows, and pricing metadata.
- `src/providers/catalog.ts` stores provider status, auth requirements, setup hints, and recommended models.
- `src/providers/fallbacks.ts` validates provider fallback chains from `provider:model` entries.
- `src/providers/router.ts` maps agent modes such as `review`, `commit`, and `chat` onto model roles and resolves explicit, role-based, default, and fallback routes.
- `src/providers/toolCallingStrategy.ts` maps provider/model capability to native tools, JSON blocks, ApeironCode tool-call tags, or plain text.
- `src/providers/pricing.ts` estimates dollar cost from provider usage when the selected model exists in the catalog.

The current model roles are:

- `coding`
- `reasoning`
- `fast`
- `cheap`
- `local`

These roles are configured through `config.models` and can point across providers using `provider:model` references.

## Provider UX Commands

Readiness and setup:

```bash
apeironcode provider list
apeironcode provider setup
apeironcode provider setup openrouter
apeironcode provider fallback coding
apeironcode provider doctor --provider mock --model mock-coder
apeironcode provider test --provider mock --model mock-coder
apeironcode ollama status
apeironcode ollama recommend
```

Model browsing:

```bash
apeironcode model list
apeironcode model list coding
apeironcode model recommend
apeironcode model recommend reasoning
```

TUI equivalents:

```text
/provider list
/provider setup
/provider fallback coding
/provider test
/model list
/model recommend
/ollama status
/ollama recommend
```

## Provider Catalog

The provider catalog currently includes:

- `mock`
- `ollama`
- `openai`
- `anthropic`
- `openrouter`
- `github-models`
- `groq`
- `deepseek`
- `gemini`
- `openaiCompatible`

Exact setup flows:

GitHub Models:

```bash
export GITHUB_TOKEN="github_pat_YOUR_TOKEN"
apeironcode setup --provider github-models
apeironcode
# then type: hi   (no approval dialog appears)
```

`apeironcode setup --provider <name>` configures the provider and exits
cleanly (no interactive TUI, no dashboard, no hung "Working..."). When
`GITHUB_TOKEN` is present the final message says the provider is configured
and ready; when it is missing it tells you to export `GITHUB_TOKEN` first.

Anthropic:

```bash
export ANTHROPIC_API_KEY="sk-ant-YOUR_KEY"
apeironcode setup --provider anthropic
```

Ollama:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
apeironcode setup --provider ollama
```

Config is stored ApeironCode-first at `~/.apeironcode-agent/config.json`. A
legacy `~/.opencode-agent` home is migrated automatically on first run
(non-destructive — the legacy directory is left intact).

### Verify your GitHub token with curl

GitHub Models requires a token with **Models: Read** permission and that
GitHub Models is enabled for the account/org. Verify independently:

```bash
curl -sS https://models.github.ai/inference/chat/completions \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4.1","messages":[{"role":"user","content":"Say hello"}]}'
```

A `200` with a reply means the token is valid. ApeironCode sends exactly
these headers and endpoint.

### What a 401 means and how to fix it

`Provider returned 401` / `GitHub Models authentication failed` means the
token is invalid, expired, missing **Models: Read**, or GitHub Models is not
enabled. ApeironCode fails fast (no retry loop, no stack trace) and shows:

1. Create a GitHub token with Models: Read permission.
2. `export GITHUB_TOKEN="github_pat_..."`
3. `apeironcode doctor --strict`
4. `apeironcode`

An authentication failure is an environment problem, not project knowledge:
ApeironCode never shows a "Save project memory" prompt and never records
`Provider returned 401` as a pitfall after a failed chat.

### What a 400 means and how to debug it

`OpenAI rejected the request payload (400): <reason>` or
`GitHub Models rejected the request payload (400): <reason>` means the
**request body** was invalid — not the token. ApeironCode sends exactly the
verified curl shape (whitelisted fields, string content, valid roles, no
tools for pure chat), sanitizes OpenAI-compatible function tool schemas, and
retries a rejected tool-schema payload once without tools when safe. It
surfaces only a concise safe diagnostic such as `Provider rejected a tool
schema: revert_patch` — never the token, headers, prompt, or raw body — and
does not retry-loop. Common causes: an unsupported field, an invalid `model`,
or an incompatible tool schema.

Run a safe live smoke (mocked in tests, real network only when you run it):

```bash
apeironcode provider smoke github-models
# or
apeironcode provider test --provider github-models --strict
```

It sends the minimal `Say hello` request, prints success/failure, the safe
reason, the endpoint, and only a token fingerprint — never the token.

### Tool calling on OpenAI-compatible providers

OpenAI, OpenAI-compatible endpoints, OpenRouter, Groq, DeepSeek, and GitHub
Models use the same function-tool payload hardening. To keep them reliable,
ApeironCode:

- sends **zero tools** for pure chat (`hi`, `hello`, `what can you do?`) —
  the payload is exactly model + messages + stream.
- sanitizes every tool schema to an OpenAI-compatible
  `{type:"function",function:{name,description,parameters:{type:"object",
  properties:{},required:[]}}}`, filling missing `properties`/`required`
  (the "object schema missing properties" 400) and stripping `$schema`/`$defs`.
- drops any tool whose parameters cannot be made object-shaped.
- on a `400` tool-schema rejection, retries once with tools disabled so a
  simple prompt still answers; if the task genuinely needs tools it reports a
  safe concise message.

For heavy multi-tool agentic tasks, Anthropic or OpenAI are currently the
most reliable providers. `apeironcode provider smoke github-models` sends the
minimal `Say hello` request and now reports **PASS** whenever the model
returns any content (only an empty response is unexpected).

### Simple actions & payload budget

Trivial requests are handled on a cheap path — no full repo context, no
memory-graph injection, no giant "implement feature" plan:

- `create a file named hello.md in the root` → recognized as a file create,
  asks approval, writes via the file tool. No provider tool registry sent.
- `create a simple modern web app using HTML CSS JS` or `create a simple
  modern web application using HTML CSS JS` → asks once, then creates
  `index.html`, `styles.css`, and `app.js`. No provider call.
- `rename README.md to read.md` → recognized rename, asks approval.
- `show project tree`, `list files`, `read src/x.ts` → read-only, no approval.
- `run npm test` → asks approval before running.
- `hi` / `what can you do?` → plain chat, zero tools.

ApeironCode estimates the request body before sending. For GitHub Models, an
oversized payload first drops tools; if it is still too large it fails fast
with `payload too large` (no doomed 413 request, no retry of the same
payload). GitHub Models is great for chat/planning/light tools; for
heavy multi-tool agentic work Anthropic or OpenAI are more reliable.

### Approval behavior

- Chat, explanation, planning, and read-only tools (`project_tree`,
  read file, list, search/grep, context preview, doctor/status/help,
  Project Brain plan/status/show) run without an approval prompt.
- File edits/writes/deletes, shell commands, package installs, git writes,
  GitHub/MCP writes, and Project Brain init/sync ask for approval.
- Destructive commands, secret egress, path traversal, and protected paths
  are blocked or require critical confirmation.

Security: never paste real tokens into chat, do not commit `.env`, and mock
mode is testing-only. Setup, `provider status`, and `doctor` only show a
redacted key fingerprint — never the full token.

Each entry records whether the provider is stable, experimental, or planned, whether it is local or cloud-hosted, which environment variables are required, and which models are recommended for roles such as `coding`, `reasoning`, `fast`, `local`, and `cheap`.

## Readiness Model

`provider list` now summarizes:

- whether the provider is local or cloud-backed
- whether required credentials are present
- the configured base URL when relevant
- whether the provider is the active default
- a recommended catalog model for that provider
- a capability summary for the active or recommended model profile

For local providers:

- `mock` is always usable for deterministic local tests
- `ollama` is treated as configured when a base URL is present, then validated further by live smoke

For cloud providers, readiness is based primarily on whether the expected API key environment variable is present.

`localOnly=true` filters cloud-hosted providers out of recommendation and fallback output.

## Setup Guidance

`provider setup` is intentionally action-oriented:

- `mock`
	points users at deterministic local test usage

- `ollama`
	shows the daemon, pull, and base URL flow

- cloud providers
	tell the user which environment variable to export and how to select the provider and model

## Model Catalog

The model catalog now tracks:

- display names
- provider association
- roles
- rough price tier (`free`, `cheap`, `paid`)
- capability flags such as local execution, tool calling, and context window notes

The active model profile is also fed back into prompt construction.

- smaller local or prompt-tool models get stricter tool-format guidance
- large-context models are reminded to stay selective even when more context is available
- provider diagnostics surface the same capability summary so the runtime and UX stay aligned

`model list` combines that catalog with provider readiness so users can see whether a model’s backing provider is already usable.

`model recommend` ranks catalog entries by role, configured-provider status, locality, and basic affordability heuristics.

Recommendations include local/cloud labels, setup-required notes when an API key is missing, and Ollama pull hints for local models. Secret values are never printed.

## Fallback Chains

Fallback entries use `provider:model` format. Invalid entries, missing providers, missing environment variables, and `localOnly` exclusions are shown as skipped entries with a reason.

`apeironcode provider fallback [role]` and `/provider fallback [role]` show:

- role
- chain entries
- configured or missing status
- skipped reasons
- selected fallback, if automatic fallback is enabled
- `autoFallback` true or false

Automatic fallback is enabled only when `fallbackModel` is configured. If it is false, ApeironCode reports available candidates but does not silently switch providers.

Phase 19 adds failure simulation so users can see runtime behavior without making real provider calls:

```bash
apeironcode provider fallback simulate missing-key
apeironcode provider fallback simulate rate-limit
apeironcode provider fallback simulate timeout
apeironcode provider fallback simulate invalid-response
apeironcode provider fallback simulate malformed-tool-call
```

TUI:

```text
/provider fallback simulate rate-limit
/provider fallback simulate timeout
```

Simulation output shows the classified failure, whether it is retryable, whether `autoFallback` is enabled, which fallback would be selected or suggested, and whether `localOnly` filtered cloud providers. This is a visibility tool; it does not make real API calls.

## Ollama Local-First UX

Ollama commands never auto-pull models:

```bash
apeironcode ollama status
apeironcode ollama models
apeironcode ollama recommend
apeironcode ollama pull-hint qwen2.5-coder:7b
```

If Ollama is unreachable, output suggests `ollama serve`. If a recommended local model is missing, output suggests `ollama pull <model>`.
