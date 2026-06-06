# Architecture Invariants

- Do not reintroduce provider.chat().
- Do not reintroduce XML tool directives.
- Use provider.stream() and ProviderStreamChunk.
- All tools must go through ToolSchema and ToolRegistry.
- No direct tool execution outside ToolRegistry.
- No real external network calls in default tests.
- No secrets in logs, traces, exports, doctor output, snapshots, or tests.
- Keep files under 600 lines.
- Prefer files under 250–350 lines.
- Preserve native tool calling, streaming UI, sandboxing, memory, context, token efficiency, evals, GitHub automation, MCP.