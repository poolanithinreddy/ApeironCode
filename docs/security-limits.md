# Security Limits

ApeironCode Agent is local-first and approval-gated, but it does not claim stronger isolation than it implements.

```bash
apeironcode security status
apeironcode security limits
```

Current explicit limits:

- no OS-level sandboxing
- no per-subagent provider/connector credential vault
- no cloud/distributed execution
- no parallel editing
- rename detection is heuristic/hash/text based, not semantic refactor analysis

Use external containers/sandboxes and least-privilege environment tokens when your threat model requires stronger boundaries.
