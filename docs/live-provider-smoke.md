# Live Provider Smoke

ApeironCode Agent now exposes a live smoke path for provider readiness in both the CLI and the interactive TUI.

## Commands

- `apeironcode provider test`
  Runs a non-strict live smoke against the active provider. Missing credentials or missing local services are reported as `SKIP` when the check cannot be run safely.

- `apeironcode provider test --strict`
  Treats skipped checks, missing credentials, and weak smoke responses as failures and exits non-zero.

- `apeironcode provider test --provider <name> --model <model> --base-url <url>`
  Overrides the provider, model, and base URL for a single smoke run.

- `apeironcode provider test --provider mock --model mock-coder`
  Always runs locally and is suitable for CI.

- `apeironcode doctor --provider-check`
  Runs the normal environment doctor plus the live provider smoke.

- `apeironcode doctor --provider-check --strict`
  Makes the provider connectivity portion fail the command when the smoke result is not a clean pass.

- `apeironcode provider doctor`
  Combines provider readiness context with the smoke result so the output shows both setup state and live response health.

## Result Semantics

- `PASS [HIGH]`
  The provider responded correctly to the smoke prompt.

- `WARN [MEDIUM|LOW]`
  The provider responded, but the response was unexpected or confidence is incomplete.

- `SKIP [NONE]`
  The smoke was intentionally not attempted because required credentials were missing and strict mode was not enabled.

- `FAIL [LOW|NONE]`
  The provider was unreachable, misconfigured, or strict mode escalated a skipped/weak result.

CLI output includes provider, model, status, confidence, detail, and latency when available. The smoke prompt is intentionally tiny: `Reply with OK.`

## Ollama

Ollama smoke now checks both reachability and whether the configured model is available at the selected base URL. When Ollama is reachable but the model is missing, the smoke warns and suggests `ollama pull <model>`.

Cloud provider smoke checks only run when the required environment variable is present. In non-strict mode missing credentials are skipped with setup guidance; in strict mode they fail.

## TUI

The interactive TUI status bar now shows a live provider confidence badge such as `pass/high`, `warn/medium`, `skip/none`, or `fail/low` based on the active provider configuration.

The provider and model slash commands are also wired directly into the same readiness helpers:

- `/provider list`
- `/provider setup`
- `/provider test`
- `/model list`
- `/model recommend`

## Practical Guidance

- Use `provider list` first when you are setting up a new environment.
- Use `provider setup <name>` when a provider is listed as `needs-setup`.
- Use `provider test` for a quick live check.
- Use `provider doctor` when you want readiness plus smoke output in one place.
- Use `model recommend` when you want a good default for a role such as `coding`, `fast`, or `reasoning`.
