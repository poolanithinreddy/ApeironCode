# Evaluations

ApeironCode Agent includes a small mock-only evaluation surface for local smoke checks:

```bash
apeironcode eval list
apeironcode eval run smoke
apeironcode eval report
```

These evals do not call paid APIs. They are intended to prove command routing, report generation, and local quality gates before adding heavier benchmark suites.

Initial eval groups:

- `smoke`
- `repo-understanding`
- `tool-calling`
- `patch-apply`
- `memory-retrieval`
- `provider-fallback`
- `workflow-dry-run`

This is not a public benchmark claim. Treat it as a local product-health harness.

