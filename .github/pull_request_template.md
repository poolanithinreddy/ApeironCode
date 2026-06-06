# Summary

<!-- What does this PR change and why? -->

## Changes

-

## Validation

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] relevant smoke passes (e.g. `npm run smoke:dogfood`)
- [ ] `npm run check:file-size` passes

## Safety checklist

- [ ] No secrets added (keys via environment variables only)
- [ ] Approval preserved before file writes and shell commands
- [ ] No `provider.chat()`; `provider.stream()` only
- [ ] No XML tool directive path; tools go through `ToolRegistry`
- [ ] Normal-mode output stays clean; debug details still available
- [ ] Docs updated if behavior changed
