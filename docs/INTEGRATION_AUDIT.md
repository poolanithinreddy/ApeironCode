# Integration Audit: Phases 9-14 Starting Point

**Date:** April 28, 2026  
**Purpose:** Identify gaps between subsystems and integration requirements

## UI Component Integration Status

### ToolCard 2.0
**Status:** ⚠️ PARTIALLY INTEGRATED
- ✅ Component exists and is used in MessageList
- ✅ Shows tool name and status
- ⚠️ Does NOT show: source, risk level, permission decision, duration
- **Issue:** ToolCallRecord lacks permission/audit metadata
- **Solution:** Need to extend ToolCallRecord or create audit-to-UI bridge

### ApprovalPrompt 2.0
**Status:** ⚠️ PARTIALLY INTEGRATED
- ✅ Component exists and is used in ChatScreen
- ✅ Shows title and message
- ⚠️ Does NOT show: risk level, matched rule
- **Issue:** ApprovalRequest from approvals.ts lacks risk level and matched rule
- **Solution:** Need to extend ApprovalRequest with audit/permission metadata

### ErrorPanel
**Status:** ❌ NOT INTEGRATED
- ✅ Component exists
- ❌ Not imported or used anywhere
- **Solution:** Need to wire into error boundaries in App.tsx

### SessionPicker
**Status:** ❌ NOT INTEGRATED
- ✅ Component exists
- ❌ Not imported or used
- **Solution:** Should be used in /resume command or session selection flow

### ModelPicker
**Status:** ❌ NOT INTEGRATED
- ✅ Component exists
- ❌ Not imported or used
- **Solution:** Should be used in /model command or provider selection flow

### StatusBar
**Status:** ✅ INTEGRATED
- ✅ Component exists
- ✅ Used in ChatScreen
- ✅ Shows provider, model, cwd, git branch, approval mode, session id
- ✅ Shows usage summary if available

### TodoPanel
**Status:** ✅ INTEGRATED
- ✅ Component exists
- ✅ Used in ChatScreen
- ✅ Shows todo items from task state

## ToolCallRecord Metadata Gap

**Current ToolCallRecord fields:**
```typescript
id: string;
toolName: string;
input: Record<string, unknown>;
explanation?: string;
status: 'pending' | 'running' | 'success' | 'error';
createdAt: string;
result?: ToolResult;
error?: string;
```

**Missing for Phase 9 TUI enhancements:**
- riskLevel?: 'low' | 'medium' | 'high' | 'critical'
- permissionDecision?: 'allow' | 'deny' | 'approved' | 'rejected'
- source?: 'builtin' | 'plugin' | 'mcp'
- durationMs?: number
- matchedRule?: string (the permission rule text)

**Current data source:**
- Risk level: from ToolDefinition in registry
- Permission decision: from UnifiedToolExecutor
- Source: can be derived from toolName (plugin:*, mcp:*)
- Duration: from AuditLog (startTime to endTime)
- Matched rule: from AuditLog

**Current flow:**
Agent → tool.invoke() → UnifiedToolExecutor → {decision, matchedRule, durationMs} → recorded to AuditLog
But: ToolCallRecord doesn't get this data

## ApprovalRequest Metadata Gap

**Current ApprovalRequest fields:**
```typescript
kind: 'command' | 'git' | 'write' | 'pr' | 'other';
scope: 'local' | 'external';
title: string;
message: string;
details?: string;
diff?: string;
requiresExtraConfirmation: boolean;
riskLevel?: string; // EXISTS but optional
resource?: string; // EXISTS but optional
```

**Current gap:**
- riskLevel and resource exist but aren't always populated
- matchedRule is not included
- No indication of which permission rule allowed/denied

**Current flow:**
UnifiedToolExecutor → approvalManager.request() → {riskLevel, resource} → ApprovalRequest
But: matchedRule from evaluatePermissionRules is lost

## Workflow Test Status

### Node Failing Test Fixture
**Status:** ✅ FIXTURE EXISTS
- Tests exist but are excluded from main suite
- Not used in any agent workflow test
- **Gap:** No test of "agent runs test, sees failure, fixes bug"

### Git Sample Fixture  
**Status:** ✅ FIXTURE EXISTS
- Git repo exists
- Not used in any agent workflow test
- **Gap:** No test of "agent reviews diff, suggests fixes"

### Plugin Workspace Fixture
**Status:** ✅ FIXTURE EXISTS
- Plugin manifest and implementation exist
- Not used in any agent workflow test
- **Gap:** No test of "agent calls plugin tool, sees result"

### MCP Workspace Fixture
**Status:** ❌ DOES NOT EXIST
- **Gap:** Need to create for "agent calls MCP tool" workflow

### Agent Workflow Integration Tests
**Status:** ❌ DO NOT EXIST
- No tests of end-to-end agent workflows
- No tests proving agent can:
  - Explain a repo
  - Fix a failing test
  - Review a git diff
  - Commit with approval
  - Call plugin tools
  - Call MCP tools
  - Respect permission denials

## Context Engine Status

### Project Scanner (src/agent/projectScanner.ts)
**Status:** ✅ EXISTS
- ✅ Scans for languages and frameworks
- ✅ Detects package manager
- ✅ Finds test/build/lint commands
- ✅ Detects source directories
- ✅ Returns project summary

### Relevance Ranking (src/agent/relevance.ts)
**Status:** ✅ EXISTS
- ✅ Ranks files by relevance to query
- ✅ Uses keywords, paths, imports
- ✅ Returns top files within budget

### Tests for Scanner/Ranking
**Status:** ⚠️ MINIMAL
- No dedicated scanner tests
- No dedicated ranking tests
- Only used in `/context` slash command

### Context Command
**Status:** ✅ /context EXISTS
- Shows project summary
- Shows relevant files for a query
- But: not tested in isolation

## CLI Commands Status

### Fully Implemented
✅ apeironcode tools
✅ apeironcode plugins list
✅ apeironcode mcp list
✅ apeironcode permissions list
✅ apeironcode permissions add
✅ apeironcode permissions remove
✅ apeironcode permissions check
✅ apeironcode sessions list
✅ apeironcode sessions resume
✅ apeironcode sessions delete
✅ apeironcode doctor
✅ apeironcode provider test
✅ apeironcode config get/set/list

### Missing/Not Tested
⚠️ apeironcode plugins validate
⚠️ apeironcode plugins enable
⚠️ apeironcode plugins disable
⚠️ apeironcode mcp test
⚠️ apeironcode mcp tools
⚠️ apeironcode permissions reset
⚠️ apeironcode context

## Slash Commands Status

### Fully Implemented
✅ /help - lists commands
✅ /tools - lists tools
✅ /plugins - lists plugins
✅ /permissions - manage rules
✅ /sessions - list sessions
✅ /resume - resume session
✅ /model - set model
✅ /provider - set provider
✅ /config - show config
✅ /status - show session status
✅ /context - show project context
✅ /review - review git diff
✅ /commit - generate commit message
✅ /pr - generate PR description
✅ /test - run tests
✅ /lint - run linting
✅ /build - run build
✅ /memory - manage project memory
✅ /compact - compact conversation
✅ /cost - show token usage
✅ /doctor - run diagnostics
✅ /clear - clear conversation
✅ /exit - exit app

**All 21 slash commands are implemented!**

## Documentation Status

**Files that exist:**
- ✅ src/cli/commands.ts (CLI interface defined)
- ✅ src/ui/slashCommands.ts (slash commands defined)
- ✅ CLAUDE.md (project guidelines)
- ✅ AUDIT_PHASE7_START.md
- ✅ PHASE7_8_IMPLEMENTATION_REPORT.md

**Files that don't exist:**
- ❌ README.md
- ❌ docs/architecture.md
- ❌ docs/cli-reference.md
- ❌ docs/agent-loop.md
- ❌ docs/context-engine.md
- ❌ docs/tools.md
- ❌ docs/providers.md
- ❌ docs/plugins.md
- ❌ docs/mcp.md
- ❌ docs/permissions.md
- ❌ docs/sessions.md
- ❌ docs/troubleshooting.md
- ❌ CONTRIBUTING.md
- ❌ SECURITY.md
- ❌ CHANGELOG.md

## Acceptance Gate Status

### Static Checks
✅ npm run typecheck - PASSING
✅ npm run lint - PASSING  
✅ npm run test - PASSING (88 tests)
✅ npm run build - PASSING

### CLI Smoke Tests
⚠️ Not yet run systematically

### Agent Smoke Tests
❌ Not yet tested

### Workflow Integration Tests
❌ Do not exist

### Audit Log Tests
⚠️ Minimal coverage - only component tests

## Integration Gaps Summary

### Critical (Block Release)
1. ToolCard not showing permission/audit data
2. ApprovalPrompt not showing risk/rule data
3. No agent workflow integration tests
4. No README or basic documentation

### High Priority (Needed for Phase 9)
1. ErrorPanel not wired
2. SessionPicker not wired
3. ModelPicker not wired
4. ToolCallRecord needs optional permission metadata
5. ApprovalRequest needs matched rule metadata

### Medium Priority (Needed for Phase 10-14)
1. Workflow integration tests
2. Context engine tests
3. CLI smoke tests
4. Documentation

## Exact Implementation Priority

### Phase 9 (TUI Integration) - CRITICAL
1. Extend ToolCallRecord with optional permission metadata
2. Extend ApprovalRequest with matched rule
3. Pass audit data to ToolCard (via MessageList props)
4. Pass audit data to ApprovalPrompt (via ChatScreen props)
5. Wire ErrorPanel into error boundaries
6. Add audit log to App.tsx state
7. Wire SessionPicker into /resume flow (optional UI)
8. Wire ModelPicker into /model flow (optional UI)

### Phase 10 (Workflow Tests) - CRITICAL
1. Create MCP workspace fixture with echo server
2. Implement agent workflow test: explain repo
3. Implement agent workflow test: fix failing test
4. Implement agent workflow test: review git diff
5. Implement agent workflow test: commit with approval
6. Implement agent workflow test: plugin tool call
7. Implement agent workflow test: MCP tool call
8. Implement agent workflow test: permission denial
9. Implement agent workflow test: dangerous command block

### Phase 11 (Context Engine) - IMPORTANT
1. Add tests for project scanner
2. Add tests for relevance ranking
3. Wire context command tests

### Phase 12 (CLI/Slash) - MOSTLY DONE
1. Smoke test all commands
2. Add /mcp test, /mcp tools, /plugins validate/enable/disable

### Phase 13 (Docs) - CRITICAL FOR RELEASE
1. Write README.md
2. Write docs/architecture.md
3. Write docs/cli-reference.md
4. Write docs/permissions.md
5. Write docs/plugins.md
6. Write docs/mcp.md

### Phase 14 (Gates) - CRITICAL
1. Run all static checks
2. Run all CLI smoke tests
3. Verify all workflow tests pass
4. Verify all audit tests pass

## Recommendations

1. **Start with Phase 9 immediately** - The integration gaps are blocking feature visibility
2. **Extend ToolCallRecord minimally** - Only add optional fields needed for UI
3. **Pass audit log to UI layer** - Keep it as optional data, not required
4. **Create one agent workflow test first** - Prove the pattern works before mass-creating tests
5. **Delay beautiful docs until after workflows work** - Functionality before polish
