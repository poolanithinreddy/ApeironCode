# Release Checklist

## Pre-Release Gates

### Static Validation
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run test` passes (all test files)
- [ ] `npm run test:e2e` passes deterministic integration/acceptance tests
- [ ] `npm run test:acceptance` passes E2E plus integration checks
- [ ] `npm run build` succeeds
- [ ] `npm run check:file-size` passes with no temporary exceptions
- [ ] `npm pack --dry-run` shows the expected package contents
- [ ] `npm run acceptance` passes (full validation)

### CLI Smoke Tests
- [ ] `npm run smoke:cli` passes
- [ ] Built CLI responds to `--help`
- [ ] Built CLI responds to `--version`
- [ ] `apeironcode doctor` runs
- [ ] `apeironcode config list` shows configuration
- [ ] `apeironcode tools` lists available tools
- [ ] `apeironcode permissions list` shows permissions
- [ ] `apeironcode context` shows project context
- [ ] `apeironcode provider env gemini` reports variable names only
- [ ] `apeironcode connector list` reports GitHub, Linear, Jira, and Slack safely
- [ ] `apeironcode eval list` reports smoke, coding, safety, tools, and tokenEfficiency
- [ ] `apeironcode debug config` prints redacted configuration only

### Workflow Smoke Tests
- [ ] `npm run smoke:workflows` passes all 31 workflow tests
- [ ] Explain repository workflow works
- [ ] Fix failing test workflow works
- [ ] Git review workflow works
- [ ] Git commit workflow works (approval approved)
- [ ] Git commit workflow works (approval denied)
- [ ] Plugin tool execution works
- [ ] Permission denial workflow works
- [ ] Dangerous command blocking works

### Code Quality
- [ ] No console.error() in main execution paths
- [ ] No unhandled promise rejections
- [ ] No memory leaks (temp files cleaned up)
- [ ] All error paths tested

### Documentation
- [ ] README.md exists and is accurate
- [ ] docs/architecture.md exists
- [ ] docs/CLI-reference.md or equivalent exists
- [ ] docs/providers.md documents all supported providers
- [ ] docs/permissions.md explains permission rules
- [ ] docs/workflows.md explains workflow testing
- [ ] docs/troubleshooting.md addresses common issues
- [ ] LICENSE file is present

### Package Readiness
- [ ] package.json has correct name and version
- [ ] package.json has "bin" field pointing to CLI
- [ ] package.json "files" field includes dist/ and docs
- [ ] package.json has valid "license" field
- [ ] package.json has "repository" field
- [ ] Node engines requirement is >=18.18.0
- [ ] npm pack --dry-run shows correct structure

### Features Wired Into Runtime
- [ ] Agent loop exercises context engine before each task
- [ ] Tool execution goes through UnifiedToolExecutor
- [ ] Native provider streaming and tool calls work without XML directives
- [ ] Dynamic tool exposure keeps connector tools out of unrelated prompts
- [ ] Tool output compression preserves command/test failures
- [ ] Permissions are enforced for all tools
- [ ] Audit logging records all tool calls
- [ ] Approval system works (approve/deny paths)
- [ ] Sessions persist between runs
- [ ] Project memory is read and respected
- [ ] Git operations work in tool layer
- [ ] File edits show diffs before approval

### Provider Support
- [ ] Mock provider works (for testing)
- [ ] OpenAI-compatible provider works
- [ ] Gemini, Azure, and Bedrock provider definitions load without live keys
- [ ] Provider routing respects config
- [ ] Model fallback works if configured
- [ ] Usage tracking works

### Connector Support
- [ ] GitHub, Linear, Jira, and Slack env checks show configured/missing status only
- [ ] Connector tools are registered through ToolRegistry
- [ ] Missing connector config returns clean redacted tool errors
- [ ] Connector write tools remain approval-gated and clearly labeled

### Sandbox, Memory, Context, and Evals
- [ ] Sandbox manager is tested with mocked Docker/Podman/Firejail availability
- [ ] Default tests never require Docker, Podman, or Firejail
- [ ] Memory retrieval/compression redacts secret-like facts
- [ ] Context compression reports full/summary/omitted tiers
- [ ] Eval results include token-efficiency metrics and are loadable
- [ ] Session Markdown/HTML exports are redacted and self-contained

### Plugin System
- [ ] Plugins load from .apeironcode-agent/plugins
- [ ] Plugin tools appear in /tools list
- [ ] Plugin tools execute successfully
- [ ] Plugin manifest validation works

### MCP Status
- [ ] Document exact MCP status (alpha/experimental/stable/deferred)
- [ ] Document which MCP features work
- [ ] Document which MCP features are not yet implemented
- [ ] Document how to test MCP if applicable

## Release Classifications

### Not Ready
- Any static gate failing
- Workflow tests failing
- Undocumented features
- Overclaimed capabilities

### Internal Alpha
- All static gates passing
- Workflow tests passing
- Known issues documented
- For internal testing only

### Public Alpha
- All static gates passing
- Workflow tests passing
- Comprehensive documentation
- CLI smoke tests passing
- Known limitations clearly marked
- Community feedback invited

### Public Beta
- All static gates passing
- All smoke tests passing
- Full documentation complete
- Provider matrix tested and verified
- Edge cases handled gracefully
- Performance acceptable
- Security review complete

### Release Candidate
- All static gates passing
- All smoke tests passing
- Full end-to-end testing complete
- Performance benchmarks acceptable
- No known critical issues
- Documentation complete and accurate
- Ready for production use

## Validation Commands

Run these to verify release readiness:

```bash
# Static gates
npm run typecheck
npm run lint
npm run test
npm run build

# Full acceptance
npm run acceptance
npm run test:e2e
npm run test:acceptance
npm run ci

# Smoke tests
npm run smoke:cli
npm run smoke:workflows
npm run smoke:all

# Built artifact verification
node dist/cli/index.js --help
node dist/cli/index.js --version
node dist/cli/index.js doctor
node dist/cli/index.js config list
node dist/cli/index.js tools
node dist/cli/index.js permissions list
node dist/cli/index.js context
node dist/cli/index.js connector list
node dist/cli/index.js eval list
node dist/cli/index.js debug config
```

## Known Limitations to Document

- Live provider evals are environment-gated and are not part of default CI
- Context engine relevance uses deterministic heuristics, not LLM ranking
- Mock provider generates scripted native tool calls; actual LLM reasoning quality still needs live-provider evaluation
- Multi-turn workflows tested in isolation, not in extended conversations
- Live provider testing (Ollama, OpenRouter, etc.) requires manual setup
- IDE extension parity remains future work

## Files to Include in Package

```
dist/
  cli/
    index.js
    index.js.map
    index.d.ts
README.md
LICENSE
docs/
  *.md
```

## Pre-Publish Checklist

- [ ] npm pack --dry-run shows correct files
- [ ] All deps in package.json are pinned or specified correctly
- [ ] No local paths in dependencies
- [ ] bin field points to correct dist location
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] npm login verified
- [ ] npm publish --dry-run succeeds
- [ ] GitHub release drafted with notes

## Post-Release

- [ ] GitHub release published
- [ ] npm package published
- [ ] Announce on relevant channels
- [ ] Monitor for issues
- [ ] Gather user feedback
- [ ] Plan next release
