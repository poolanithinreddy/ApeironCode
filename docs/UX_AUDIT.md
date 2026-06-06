# Phase 18 UX Audit

## What Felt Confusing

- First run still looked provider-centric instead of task-centric. A new user saw Ollama defaults and diagnostics before a clear "try without an API key" path.
- The CLI help was comprehensive, but it did not show the happy path: setup, dashboard, beginner commands, then one useful task.
- Advanced systems were discoverable only if the user already knew exact commands such as `team cockpit`, `memory review`, or `skill run`.
- Memory review output could feel noisy because suggestions and graph facts are dense.

## Broken Or Weak Surfaces Found

- `apeironcode setup` existed in the in-progress source but was not fully wired as a first-run CLI surface.
- Skill templates and a product-like skill browser were not routed through CLI or slash commands.
- Sandbox status was mentioned in security language, but users had no direct `sandbox status` command.
- Evaluation/benchmark language existed in the product goals, but there was no simple mock-only `eval list/run/report` surface.

## Screens And Flows That Needed Better Empty States

- Dashboard needed clearer "No provider configured", "No team runs yet", and "No memory suggestions yet" paths.
- `/commands` needed beginner and advanced modes, command status hints, and natural next commands.
- Unknown slash commands needed suggestions instead of a dead end.

## Top Fixes Implemented In This Sprint

1. Added `apeironcode setup`, `apeironcode setup status`, and `apeironcode setup reset --dry-run`.
2. Added a no-key mock provider setup profile for immediate first-run trials.
3. Added a TUI setup option for "Try without API key".
4. Rebuilt dashboard view-model sections around project, agent readiness, work, integrations, safety, memory, and help.
5. Expanded `/commands` into categorized beginner/advanced command discovery.
6. Added natural slash aliases for common intents such as `/fix tests`, `/review diff`, `/setup ollama`, and `/open cockpit`.
7. Added skill browser and skill templates in CLI and slash routes.
8. Added `sandbox status` and `sandbox doctor` as honest detection/status commands.
9. Added mock-only `eval list`, `eval run`, and `eval report`.
10. Added focused tests for setup, sandbox, evals, skill browser/templates, CLI routing, and slash routing.

## Still Weak

- The cockpit is improved but still not a perfect modal cockpit in every TUI flow.
- Memory review is more understandable, but dense graph facts still need a calmer review screen.
- Provider fallback polish and GitHub PR/CI workflows need a deeper runtime pass.
- Sandbox support is detection/status only; command execution is not OS-sandboxed.
- The product is much more coherent, but not yet at the level of the most polished proprietary daily tools.

