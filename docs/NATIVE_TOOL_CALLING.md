# Native Tool Calling 2.0

ApeironCode Agent uses native provider tool calling as the production path. XML
directives are not used in the production tool path.

## Pipeline

1. **Tool Schema (`src/tools/schema.ts`)** — every tool is defined with a Zod
   schema and registered in `ToolRegistry`. JSON schema is generated from Zod
   for transmission to providers.

2. **Provider Tool Adapters (`src/providers/toolAdapters/`)** — provider-specific
   formatting and parsing of tool calls:
   - `anthropic.ts` — Anthropic content blocks / `input_json_delta`
   - `openai.ts` — `tool_calls` array on `delta` / `message`
   - `gemini.ts` — `functionCall` parts on candidate content
   - `generic.ts` — graceful fallback (OpenAI then Anthropic)
   - `getToolAdapter(providerId)` returns the right adapter.

3. **Provider Capabilities (`src/providers/toolCompatibility.ts`)** — capability
   matrix per provider: native tool calling, streaming, parallel calls, JSON
   schema support, max tools, quirks, and tool-calling strategy
   (`native`, `native_serialized`, `disabled`).

4. **Tool Input Repair (`src/agent/toolInputRepair.ts`)** — best-effort recovery
   of malformed tool input JSON (trailing commas, double-stringified payloads,
   wrapped `{toolName, input}` envelopes). Provides actionable schema-validation
   feedback when unrecoverable.

5. **Tool Result Contract (`src/tools/resultContract.ts`)** — normalizes tool
   output to `{ok, severity, summary, output, truncated}`, redacts secrets
   (Bearer tokens, AWS keys, OpenAI keys, password/secret/token assignments),
   compresses large output while preserving failing test lines, and renders for
   model and user.

6. **Tool Call Orchestrator (`src/agent/toolCallOrchestrator.ts`)** — classifies
   tools (`readonly | write | command | connector`), groups consecutive read-only
   tools for parallel execution, and serializes writes/commands. Always returns
   results in original index order.

7. **Schema Minifier (`src/tools/schemaMinifier.ts`)** — token-saver for tool
   schemas: strips short property descriptions for non-risky tools, sorts
   property keys alphabetically. Risky tools (`edit_file`, `write_file`,
   `patch_file`, `run_command`, `revert_patch`) preserve all descriptions.

8. **Exposure Policy (`src/tools/exposurePolicy.ts`)** — task-aware filtering.
   `getExposedToolsForContext(allTools, {mode, prompt, providerCapabilities})`
   restricts tools by mode and provider capability.

9. **Observability Events (`src/core/events/events.ts`)** — `tool_call.parsed`,
   `tool_call.repaired`, `tool_call.schema_validation_failed`,
   `tool_call.retry_requested`, `tool_call.parallel_group_started/completed`,
   `tool_result.normalized`, `tool_schema.minified`.

## Invariants

- All agent-callable tools go through `ToolRegistry`. No bypasses.
- Provider streaming via `provider.stream()` only.
- No secrets ever leave through tool results — `redactSecrets` runs on every
  normalized result.
- Tool output stays under the configured `maxToolOutputTokens` budget; failing
  test lines and stack traces are preserved during compression.
- Risky tools always include full schema descriptions, even when minified.
