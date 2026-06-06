# Demo Script

Build first:

```bash
npm run build
```

Try:

```bash
npm run demo:explain
npm run demo:plan
npm run demo:fix-test
npm run demo:session
npm run demo:background
npm run demo:share
npm run demo:provider
npm run demo:github
npm run demo:skill
npm run demo:skills
npm run demo:memory
npm run demo:team
npm run demo:workflow
npm run demo:dashboard
npm run demo:team-isolated
npm run demo:workflow-runtime
npm run demo:memory-review
npm run demo:approval
npm run demo:worktree
npm run demo:merge-conflict
npm run demo:team-artifacts
npm run demo:review-ui
npm run demo:artifact-browser
npm run demo:rename-merge
npm run demo:parallel-readonly
npm run demo:review-cockpit
npm run demo:merge-resolution
npm run demo:workspace-ignore
npm run demo:live-cockpit
npm run demo:patch-export
npm run demo:patch-validate
npm run demo:cockpit-memory
npm run demo:setup
npm run demo:sandbox
npm run demo:eval
```

Suggested recording:

1. Show `apeironcode doctor`.
2. Show `apeironcode context index` and `apeironcode context budget`.
3. Show `apeironcode memory suggestions` and `apeironcode memory graph`.
4. Create and run a skill plan with `--no-run`, then show a scoped run against the mock provider.
5. Show GitHub issue creation in `--dry-run` mode.
6. Show a team dry run, then a mock-provider sequential team run in a disposable fixture.
7. Show workflow catalog/runtime proof.
8. Start a no-run/background session and follow logs.
9. Show `apeironcode team run "..." --workspace temp-copy --dry-run`, then `apeironcode team workspaces` after a real disposable run.
10. Show `apeironcode workflow show fix-tests` and `apeironcode workflow run fix-tests --dry-run`.
11. Show the memory review queue and approval preview dry runs.
12. Show `team review`, artifact browsing, rename-aware merge planning, and `--parallel-readonly --dry-run`.

Do not publish or post connector writes during the demo.
See `docs/demo-checklist.md` for the non-destructive checklist.
See `docs/demo-isolated-team.md` and `docs/demo-workflows.md` for Phase 13 demos.
See `docs/demo-worktree.md` and `docs/demo-merge-review.md` for Phase 14 demos.
See `docs/demo-review-ux.md`, `docs/demo-rename-merge.md`, and `docs/demo-parallel-readonly.md` for Phase 15 demos.
See `docs/demo-review-cockpit.md`, `docs/demo-merge-resolution.md`, and `docs/demo-workspace-ignore.md` for Phase 16 demos.
See `docs/demo-live-cockpit.md` and `docs/demo-patch-export.md` for Phase 17 demos.
