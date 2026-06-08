import {describe, expect, it} from 'vitest';

import {buildErrorPanelViewModel, buildHomeDashboardViewModel, buildStatusBarViewModel} from '../../src/ui/viewModels.js';

describe('ui view models', () => {
  it('builds a home dashboard snapshot with workspace, model, mode, shortcuts, and history hints', () => {
    const viewModel = buildHomeDashboardViewModel({
      activeTask: {
        commandsRun: [],
        createdAt: '2026-04-28T00:00:00.000Z',
        filesChanged: [],
        filesInspected: [],
        goal: 'Harden runtime UX',
        id: 'task-123',
        linkedSessionId: 'session-1',
        memorySuggestions: [],
        mode: 'debug',
        permissionDecisions: [],
        status: 'running',
        steps: [],
        testsRun: [],
        updatedAt: '2026-04-28T00:05:00.000Z',
      },
        codeIntelligenceLine: 'Code Intelligence: Fallback code intelligence (TypeScript LSP unavailable) sessions:0 cache:0',
      historyHint: 'Use /commands and /history to continue previous work.',
      modeLabel: 'explain (inferred from prompt)',
      model: 'mock-coder',
      projectSummary: 'Terminal-native TypeScript coding assistant.',
      provider: 'mock',
      recentSessions: [
        {
          id: 'session-1',
          model: 'mock-coder',
          projectPath: '/tmp/opencode',
          provider: 'mock',
          title: 'Explain the repo',
          updatedAt: '2026-04-28T00:10:00.000Z',
        },
      ],
      shortcuts: [
        {command: '/feature <request>', description: 'Ship a focused feature slice'},
        {command: '/repo', description: 'See repo architecture and hotspots'},
      ],
      title: 'Workspace Home',
      workspacePath: '/Users/example/opencode',
    });

    expect(viewModel.projectPathLine).toBe('/Users/example/opencode');
    expect(viewModel.headerLine).toContain('opencode | mock/mock-coder | mode:explain (inferred from prompt)');
    expect(viewModel.codeIntelligenceLine).toContain('Code Intelligence: Fallback code intelligence');
    expect(viewModel.codeIntelligenceLine).toContain('sessions:0 cache:0');
    expect(viewModel.shortcutLines).toContain('/feature <request> | Ship a focused feature slice');
    expect(viewModel.activeTaskLine).toContain('running | debug | Harden runtime UX');
    expect(viewModel.recentSessionLines[0]).toContain('Explain the repo | mock/mock-coder');
    expect(viewModel.historyHint).toContain('/history');
  });

  it('builds a status bar snapshot with repo-map freshness and provider confidence', () => {
    const viewModel = buildStatusBarViewModel({
      activeMode: 'review',
      activeTaskId: 'task-12345678',
      activeTaskStatus: 'running',
      approvalMode: 'ask',
      codeIntelligenceStatus: 'fallback/0srv/0sess/0cache',
      cwd: '/Users/example/opencode',
      gitBranch: 'main',
      model: 'mock-coder',
      provider: 'mock',
      providerConfidence: 'pass/high',
      repoMapStatus: 'fresh/1m',
      sessionId: 'session-12345678',
      status: 'Working',
      usageSummary: '120 tokens',
    });

    expect(viewModel.workspaceLabel).toBe('opencode');
    expect(viewModel.providerLabel).toBe('Mock provider · testing only');
    expect(viewModel.modeLabel).toBe('mode:review');
    expect(viewModel.repoMapLabel).toBe('repo:fresh/1m');
    expect(viewModel.codeIntelligenceLabel).toBe('code:fallback/0srv/0sess/0cache');
    expect(viewModel.providerConfidenceLabel).toBe('pass/high');
    expect(viewModel.activeTaskLabel).toBe('task:task-123:running');
  });

  it('formats object-like error values without leaking [object Object]', () => {
    const viewModel = buildErrorPanelViewModel({
      details: {phase: 'doctor'},
      message: {error: 'provider failed'},
      title: {name: 'Agent Error'},
      type: 'provider-error',
    });

    expect(viewModel.title).toContain('"name": "Agent Error"');
    expect(viewModel.message).toContain('"error": "provider failed"');
    expect(viewModel.details).toContain('"phase": "doctor"');
    expect(viewModel.message).not.toContain('[object Object]');
  });

  it('displays agent session counts in home dashboard', () => {
    const viewModel = buildHomeDashboardViewModel({
      activeTask: null,
      agentSessions: [
        {
          id: 'session-1',
          projectRoot: '/tmp',
          goal: 'Test session 1',
          status: 'running',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:05:00.000Z',
          filesLocked: [],
          filesChanged: [],
          commandsRun: [],
          testsRun: [],
        },
        {
          id: 'session-2',
          projectRoot: '/tmp',
          goal: 'Test session 2',
          status: 'queued',
          createdAt: '2026-04-28T00:01:00.000Z',
          updatedAt: '2026-04-28T00:01:00.000Z',
          filesLocked: [],
          filesChanged: [],
          commandsRun: [],
          testsRun: [],
        },
        {
          id: 'session-3',
          projectRoot: '/tmp',
          goal: 'Test session 3',
          status: 'paused',
          createdAt: '2026-04-28T00:02:00.000Z',
          updatedAt: '2026-04-28T00:02:00.000Z',
          filesLocked: [],
          filesChanged: [],
          commandsRun: [],
          testsRun: [],
        },
      ],
      codeIntelligenceLine: 'Mock LSP',
      modeLabel: 'chat',
      model: 'test-model',
      projectSummary: 'Test project',
      provider: 'mock',
      recentSessions: [],
      shortcuts: [],
      title: 'Test',
      workspacePath: '/tmp',
    });

    expect(viewModel.sessionSummaryLine).toBe('Agent Sessions — running:1 | queued:1 | paused:1');
  });

  it('displays file lock count in home dashboard', () => {
    const viewModel = buildHomeDashboardViewModel({
      activeTask: null,
      agentLocks: [
        {
          filePath: '/tmp/file1.ts',
          sessionId: 'session-1',
          goal: 'test',
          createdAt: '2026-04-28T00:00:00.000Z',
        },
        {
          filePath: '/tmp/file2.ts',
          sessionId: 'session-1',
          goal: 'test',
          createdAt: '2026-04-28T00:00:00.000Z',
        },
        {
          filePath: '/tmp/file3.ts',
          sessionId: 'session-2',
          goal: 'test',
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      codeIntelligenceLine: 'Mock LSP',
      modeLabel: 'chat',
      model: 'test-model',
      projectSummary: 'Test project',
      provider: 'mock',
      recentSessions: [],
      shortcuts: [],
      title: 'Test',
      workspacePath: '/tmp',
    });

    expect(viewModel.lockCountLine).toBe('File Locks — 3 files locked');
  });

  it('does not display session/lock lines when none are active', () => {
    const viewModel = buildHomeDashboardViewModel({
      activeTask: null,
      agentSessions: [],
      agentLocks: [],
      codeIntelligenceLine: 'Mock LSP',
      modeLabel: 'chat',
      model: 'test-model',
      projectSummary: 'Test project',
      provider: 'mock',
      recentSessions: [],
      shortcuts: [],
      title: 'Test',
      workspacePath: '/tmp',
    });

    expect(viewModel.sessionSummaryLine).toBeUndefined();
    expect(viewModel.lockCountLine).toBeUndefined();
  });

  it('displays pending memory suggestion count in home dashboard', () => {
    const viewModel = buildHomeDashboardViewModel({
      activeTask: null,
      codeIntelligenceLine: 'Mock LSP',
      memorySuggestionCount: 2,
      memorySuggestionSummary: 'Remember validation command',
      modeLabel: 'chat',
      model: 'test-model',
      projectSummary: 'Test project',
      provider: 'mock',
      recentSessions: [],
      shortcuts: [],
      title: 'Test',
      workspacePath: '/tmp',
    });

    expect(viewModel.memorySuggestionLine).toBe('Memory Suggestions — 2 pending');
    expect(viewModel.memorySuggestionSummaryLine).toContain('Remember validation command');
  });

  it('displays session count in status bar', () => {
    const viewModel = buildStatusBarViewModel({
      activeMode: 'chat',
      agentSessions: [
        {
          id: 'session-1',
          projectRoot: '/tmp',
          goal: 'Test session 1',
          status: 'running',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:05:00.000Z',
          filesLocked: [],
          filesChanged: [],
          commandsRun: [],
          testsRun: [],
        },
        {
          id: 'session-2',
          projectRoot: '/tmp',
          goal: 'Test session 2',
          status: 'queued',
          createdAt: '2026-04-28T00:01:00.000Z',
          updatedAt: '2026-04-28T00:01:00.000Z',
          filesLocked: [],
          filesChanged: [],
          commandsRun: [],
          testsRun: [],
        },
      ],
      approvalMode: 'ask',
      cwd: '/tmp',
      model: 'test-model',
      provider: 'mock',
      status: 'Ready',
    });

    expect(viewModel.sessionCountLabel).toBe('sessions:1r,1q');
  });

  it('displays lock count in status bar', () => {
    const viewModel = buildStatusBarViewModel({
      activeMode: 'chat',
      agentLocks: [
        {
          filePath: '/tmp/file1.ts',
          sessionId: 'session-1',
          goal: 'test',
          createdAt: '2026-04-28T00:00:00.000Z',
        },
        {
          filePath: '/tmp/file2.ts',
          sessionId: 'session-1',
          goal: 'test',
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      approvalMode: 'ask',
      cwd: '/tmp',
      model: 'test-model',
      provider: 'mock',
      status: 'Ready',
    });

    expect(viewModel.lockCountLabel).toBe('locks:2');
  });

  it('does not display session/lock labels when none are active', () => {
    const viewModel = buildStatusBarViewModel({
      activeMode: 'chat',
      agentSessions: [],
      agentLocks: [],
      approvalMode: 'ask',
      cwd: '/tmp',
      model: 'test-model',
      provider: 'mock',
      status: 'Ready',
    });

    expect(viewModel.sessionCountLabel).toBeNull();
    expect(viewModel.lockCountLabel).toBeNull();
  });
});
