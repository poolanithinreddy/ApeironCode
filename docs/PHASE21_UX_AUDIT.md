# Phase 21 UX Audit Report

**Date**: 2026-05-02  
**Status**: Baseline validation passed, UX audit complete  

---

## Baseline Validation ✅

```
✅ npm run typecheck — PASS
✅ npm run lint — PASS
✅ npm run build — PASS (1.07 MB bundle)
✅ npm test — PASS (101 files, 463 tests)
✅ npm pack --dry-run — PASS
✅ temp HOME setup with mock provider — PASS
```

All baseline checks pass. Ready for UX improvements.

---

## UX Audit Findings

### 1. **Message List Scrolling Issue** 🔴 CRITICAL

**Current behavior:**
- `src/ui/MessageList.tsx:14-15` hardcodes window to last 10 messages + last 4 tool calls
- Long outputs are silently truncated with no indication
- No way to scroll back and see earlier messages
- User loses conversation context

**Problems:**
- Long command outputs overflow and disappear
- Tool execution traces are not visible
- Session history is lost during TUI session
- Users can't review earlier decisions or errors

**Planned fix:**
- Implement scrollable output area with windowing strategy
- Add keyboard shortcuts: PageUp/PageDown, Ctrl+U/Ctrl+D, Home/End
- Show "N messages hidden" indicator when truncated
- Optional: `/show more`, `/show last`, `/clear` commands
- Preserve input focus after scrolling

---

### 2. **Help/Commands Output Verbosity** 🔴 CRITICAL

**Current behavior:**
- `formatSlashCommandCatalog()` generates entire command list on each `/help` or `/commands` call
- No filtering or categorization visible in output
- Text wall overwhelming for beginners
- `/commands beginner` works but still outputs too much static text
- No interactive search or filtering

**Problems:**
- Terminal fills with 50+ lines of command descriptions
- Beginner users don't know what to try first
- No way to search for specific command
- Static output, not interactive

**Planned fix:**
- Implement persistent command palette modal/panel
- Interactive search/filter query
- Category navigation
- Compact beginner view (fit in one screen)
- `/help full` for advanced users
- `/help beginner` for newcomers
- `/commands search <query>` for specific searches

---

### 3. **No Command Palette Modal** 🔴 CRITICAL

**Current behavior:**
- `/commands` and `/help` just append text messages
- No persistent modal or panel
- No keyboard navigation
- No way to "run selected command"
- No status badges (stable/experimental/requires-setup)

**Problems:**
- Not a real "launcher" experience
- Command discovery is passive (read text) not active (search/select)
- No visual hierarchy
- Ctrl+K not supported (would need modal)

**Planned fix:**
- Persistent command palette modal/panel that opens with `/commands`
- Search/filter interface
- Category navigation (beginner/advanced/agent/team/etc)
- Status badges: stable, experimental, requires-setup, approval-gated, local-only, read-only
- Preview pane showing examples
- "Copy command" or "run command" behavior if safe
- Escape key closes modal
- Ctrl+K opens (if Ink supports)

---

### 4. **No Unified TUI Navigation State** 🟡 HIGH

**Current behavior:**
- `src/ui/App.tsx` has scattered state: `dashboard`, `homeDashboard`, `errorDisplay`, `pendingApproval`
- No single source of truth for "what screen is open"
- Panels don't know about each other
- No Esc key support to go back
- Tab cycling not implemented

**Problems:**
- Switching between panels is ad-hoc
- Confusing back button behavior
- No panel-specific help
- Screen management is implicit

**Planned fix:**
- Add `activePanel` state: `'chat' | 'commandPalette' | 'dashboard' | 'skillBrowser' | 'memoryReview' | 'cockpit' | 'session' | 'provider' | 'approval'`
- Esc key closes current panel (except chat)
- q key closes where appropriate
- ? shows panel-specific help
- Tab cycles panels if feasible
- Consistent panel open/close behavior

---

### 5. **Cockpit Fixture Flow Not Tested** 🟡 HIGH

**Current behavior:**
- `src/ui/ReviewCockpit.tsx` exists but not integrated in live TUI
- No fixture generator
- `/team cockpit <id>` command exists but untested with real data
- Manual TUI testing of cockpit never completed

**Problems:**
- Cockpit features may not work in TUI
- No proof cockpit handles real merge conflicts
- No proof memory suggestions work in TUI cockpit
- Artifact browser untested live

**Planned fix:**
- Create fixture generator: `node scripts/create-cockpit-fixture.mjs`
- Or add CLI command: `apeironcode demo cockpit-fixture`
- Generates temp project with:
  - team run record
  - artifacts (patches, logs, summaries)
  - conflicts to review
  - memory suggestions
  - merge plan
- Live TUI flow:
  - `/team cockpit <fixtureTeamRunId>`
  - Switch panes (artifacts/conflicts/memory)
  - View and validate patch
  - Approve/reject memory suggestions
  - Exit back to dashboard

---

### 6. **Unified Approval Panel Missing** 🟡 HIGH

**Current behavior:**
- `ApprovalPrompt` in `src/ui/ApprovalPrompt.tsx` handles approval UI
- Different approval types may have different formats
- No consistent "approve/deny/cancel" panel appearance
- No unified preview formatter

**Approval types (spread across codebase):**
- Plan-Before-Code approval
- Tool execution approval
- Hook shell command approval
- GitHub write approval (PR/issue/comment)
- Memory destructive operation approval
- Team apply/discard approval
- Patch apply approval
- Skill elevated tool request approval

**Problems:**
- Each approval type may have different UX
- No unified risk level display
- No matched permission rule explanation
- Secrets may not be redacted everywhere
- No "always allow" option where applicable

**Planned fix:**
- Unified approval request model
- Single `ApprovalPanel` with:
  - Title
  - Action type (tool/GitHub/memory/team/patch/skill)
  - Risk level display
  - Reason text
  - Affected files/resources
  - Command/API endpoint preview
  - Diff/patch preview (truncated)
  - Matched permission rule explanation
  - Choices: approve-once, deny, cancel, always-allow (where safe)
- Test with GitHub approval, hook approval, team approval
- CLI fallback for headless approval

---

### 7. **Error and Empty State Guidance Missing** 🟡 MEDIUM

**Current behavior:**
- Empty states show generic messages
- Error messages sometimes omit next steps
- Users don't know what to do after failure

**Empty/error states identified:**
- No provider configured → /setup
- No skills installed → /skill browser
- No memory suggestions → /memory review
- No team runs → /team run <goal>
- Missing teamRunId → error + suggest /team runs
- Missing GitHub token → suggest /github auth
- Ollama unavailable → suggest /provider list
- No sandbox backend → explain (not available)
- Provider fallback not configured → suggest /provider fallback simulate
- Failed command → don't show raw stack, suggest fix
- Unknown slash command → suggest /commands search <query>
- Missing fixture → show how to create

**Planned fix:**
- Add "what happened / why / next step" to each empty/error state
- Use `createLocalMessage('assistant', ...)` with helpful guidance
- Test all 12 empty/error states

---

### 8. **Manual TUI Harness Is Weak** 🟡 MEDIUM

**Current behavior:**
- `npm run demo:tui` not well documented
- No script creates temp HOME
- Manual testing requires manual setup
- No PTY smoke tests

**Planned fix:**
- Improve `npm run demo:tui` script
- Add `npm run demo:cockpit` for fixture flow
- Add `npm run demo:palette` for command palette
- Script creates temp HOME, setups mock provider, guides through commands
- Optional PTY smoke test (if not too flaky):
  - Launch TUI
  - Send `/commands beginner`
  - Verify output
  - Send `/exit`
  - Verify exit

---

### 9. **Cockpit Pane Management Unclear** 🟡 MEDIUM

**Current behavior:**
- ReviewCockpit has multiple panes (artifacts/conflicts/memory)
- No clear way to navigate between them in TUI
- Pane switching behavior not documented

**Problems:**
- Users don't know panes exist
- No keyboard shortcuts for pane switching
- Artifacts pane may overflow

**Planned fix:**
- Add pane navigation state
- Tab/Shift+Tab cycles panes
- 1/2/3 keys jump to specific panes
- Show "pane X/3" in status bar
- Show active pane visually distinct

---

### 10. **Input Box Positioning Can Overlap** 🟡 MEDIUM

**Current behavior:**
- `src/ui/InputBox.tsx` renders at bottom
- StatusBar at top
- MessageList in middle
- Long status bar + long messages = input overlapped

**Planned fix:**
- Ensure marginTop/marginBottom spacing
- InputBox always visible at bottom
- Scrollable message area doesn't overlap input
- Test with full status bar + 20 messages

---

## Summary of Fixes Needed

| Issue | Severity | Step | Work |
|-------|----------|------|------|
| Message scrolling truncation | 🔴 CRITICAL | 2 | Scrollable area, windowing, show-more |
| Help/commands verbosity | 🔴 CRITICAL | 3 | Modal, search, beginner-compact |
| No command palette modal | 🔴 CRITICAL | 3 | Interactive modal with search/filter |
| No unified nav state | 🟡 HIGH | 4 | Navigation state machine, Esc/Tab |
| Cockpit fixture untested | 🟡 HIGH | 5 | Fixture generator + live flow test |
| Unified approval panel | 🟡 HIGH | 6 | Shared approval UI model |
| Empty state guidance | 🟡 MEDIUM | 8 | What/why/next step everywhere |
| Manual harness weak | 🟡 MEDIUM | 9 | Better demo scripts |
| Cockpit pane nav unclear | 🟡 MEDIUM | 5 | Tab/1/2/3 navigation |
| Input overlap risk | 🟡 MEDIUM | 2 | Proper spacing validation |

---

## Exact Implementation Order

1. **Step 1** — Baseline validation (DONE ✅)
2. **Step 2** — Scrollable TUI message/output area
3. **Step 3** — Persistent command palette modal
4. **Step 4** — Unified TUI navigation state
5. **Step 5** — Real cockpit fixture flow in live TUI
6. **Step 6** — Unified approval panel everywhere
7. **Step 7** — Patch preview and apply status commands
8. **Step 8** — Better error and empty states
9. **Step 9** — Manual TUI harness 2.0
10. **Step 10** — E2E TUI/CLI user flows
11. **Step 11** — Docs after implementation
12. **Step 12** — Final validation

---

## Known Blockers / Constraints

1. **Ink Architecture Limits**: Ink (React for terminal) may not support true scrollback
   - Solution: Output windowing, not infinite scrollback
2. **PTY Input/Output Flakiness**: PTY smoke tests may fail on CI
   - Solution: Use view models + manual harness, avoid PTY in CI
3. **Modal Not Standard in Ink**: Persistent modal requires custom layout
   - Solution: Box overlay with controlled input/output
4. **Terminal Height Unknown**: Can't always fit content to screen
   - Solution: Truncate with clear "more available" message

---

## Success Criteria

After Phase 21:

- [ ] Scrollable message area with windowing strategy
- [ ] Command palette modal with search/filter
- [ ] `/help beginner` fits one screen
- [ ] `/commands search <query>` works
- [ ] Unified navigation state (Esc/Tab works)
- [ ] Cockpit fixture created and tested
- [ ] Cockpit pane navigation works (Tab/1/2/3)
- [ ] Unified approval panel UI
- [ ] All empty/error states have guidance
- [ ] Manual TUI demo scripts work
- [ ] E2E user flows tested
- [ ] Manual TUI proof shows smooth UX
- [ ] No regressions in existing features
- [ ] All 463 tests still passing
- [ ] Build clean, lint clean, typecheck clean

