import {Box, Text, useApp} from 'ink';
import React, {useEffect, useRef, useState} from 'react';

import {Agent} from '../agent/Agent.js';
import {formatEffectiveModeLabel, resolveEffectiveMode} from '../agent/effectiveMode.js';
import {scanProject} from '../agent/projectScanner.js';
import type {AgentMode, ChatMessage, ToolCallRecord} from '../agent/types.js';
import {RepoMapManager} from '../context/repoMap.js';
import {runProviderSmokeTest} from '../diagnostics/doctor.js';
import {LspContextBuilder} from '../lsp/context.js';
import {LspManager} from '../lsp/manager.js';
import {MultiAgentSessionManager} from '../multisession/manager.js';
import {providerRegistry} from '../providers/registry.js';
import {SessionStore} from '../sessions/store.js';
import type {ApprovalRequest, ApprovalResponse} from '../safety/approvals.js';
import {TaskStore} from '../tasks/taskStore.js';
import {MemorySuggestionStore} from '../memory/suggestions.js';
import {TeamArtifactStore} from '../agents/artifacts/store.js';
import {SubagentWorkspaceManager} from '../agents/workspace/workspaceManager.js';
import type {TaskPlan} from '../tasks/types.js';
import {formatUnknownError, toDisplayString} from '../utils/display.js';
import {fileExists} from '../utils/fs.js';
import {getGlobalConfigPath, getProjectMemoryPath} from '../utils/paths.js';
import {ChatScreen} from './ChatScreen.js';
import type {DashboardView} from './dashboardTypes.js';
import type {ErrorPanelProps} from './ErrorPanel.js';
import {executeSlashCommand} from './slashCommands.js';
import type {SetupOptionId} from './SetupWizard.js';
import {renderDashboard} from './app/DashboardRenderer.js';
import {
  createLocalMessage,
  formatRecordedUsageSummary,
  formatUsageSummary,
  mapTaskStatusToTodoStatus,
} from './app/messages.js';
import {applySetupOption} from './app/setup.js';
import type {AppProps} from './app/appProps.js';
import {loadActiveTask} from './app/tasks.js';

export const App = ({
  configStore,
  cwd,
  initialConfig,
  initialMode,
  initialSession = null,
  needsSetup,
  providerRegistry: registry = providerRegistry,
  toolRegistry,
}: AppProps) => {
  const {exit} = useApp();
  const initialSelectedMode = initialMode ?? initialSession?.mode ?? 'chat';
  const [resolvedConfig, setResolvedConfig] = useState(initialConfig);
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession?.messages ?? []);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>(initialSession?.toolCalls ?? []);
  const [inputValue, setInputValue] = useState('');
  const [approvalInput, setApprovalInput] = useState('');
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [status, setStatus] = useState('Ready');
  const [isBusy, setIsBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(needsSetup);
  const [usageSummary, setUsageSummary] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AgentMode>(initialSelectedMode);
  const [activeModeLabel, setActiveModeLabel] = useState<string>(
    initialSession
      ? formatEffectiveModeLabel({
          effectiveMode: initialSession.mode,
          reason: initialSession.modeReason ?? 'default',
        })
      : initialSelectedMode,
  );
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [memoryInputMode, setMemoryInputMode] = useState<'append' | 'replace' | null>(null);
  const [errorDisplay, setErrorDisplay] = useState<ErrorPanelProps | null>(null);
  const [providerConfidence, setProviderConfidence] = useState<string | null>(null);
  const [repoMapStatus, setRepoMapStatus] = useState<string | null>(null);
  const [codeIntelligenceStatus, setCodeIntelligenceStatus] = useState<string | null>(null);
  const [codeIntelligenceSummary, setCodeIntelligenceSummary] = useState<string | null>(null);
  const [homeDashboard, setHomeDashboard] = useState<Extract<DashboardView, {type: 'home'}> | null>(null);
  // The auto-start home is compact by default; `/dashboard` expands it to the
  // full workspace view.
  const [homeExpanded, setHomeExpanded] = useState(false);
  const approvalResolverRef = useRef<((response: ApprovalResponse) => void) | null>(null);
  const sessionStoreRef = useRef(new SessionStore());
  const taskStoreRef = useRef(new TaskStore(cwd));
  const [activeTask, setActiveTask] = useState<TaskPlan | null>(null);
  const [agent] = useState(
    () =>
      new Agent({
        approvalHandler: async (request) => {
          setPendingApproval(request);
          setApprovalInput('');

          return new Promise<ApprovalResponse>((resolve) => {
            approvalResolverRef.current = resolve;
          });
        },
        config: initialConfig,
        cwd,
        providerRegistry: registry,
        toolRegistry,
      }),
  );

  useEffect(() => {
    agent.setMode(activeMode);
  }, [activeMode, agent]);

  useEffect(() => {
    if (!initialSession) {
      return;
    }

    agent.loadSession(initialSession);
    setMessages([...initialSession.messages]);
    setToolCalls([...initialSession.toolCalls]);
    setActiveMode(initialMode ?? initialSession.mode);
    setActiveModeLabel(formatEffectiveModeLabel({effectiveMode: initialSession.mode, reason: initialSession.modeReason ?? 'default'}));
    if (initialSession.taskPlanId) {
      void taskStoreRef.current.load(initialSession.taskPlanId).then((task) => {
        setActiveTask(task);
      });
    } else {
      setActiveTask(null);
    }
  }, [agent, initialSession]);

  useEffect(() => {
    let cancelled = false;

    void scanProject(cwd).then((scan) => {
      if (!cancelled) {
        setGitBranch(scan.git.branch);
      }
    }).catch(() => {
      // non-critical — git branch just stays null
    });

    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    if (showSetup) {
      setProviderConfidence(null);
      return;
    }

    let cancelled = false;
    setProviderConfidence('checking');

    void runProviderSmokeTest({
      config: resolvedConfig,
      providerRegistry: registry,
    }).then((result) => {
      if (!cancelled) {
        setProviderConfidence(`${result.status}/${result.confidence}`);
      }
    }).catch(() => {
      if (!cancelled) {
        setProviderConfidence('fail/low');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    registry,
    resolvedConfig,
    resolvedConfig.effective.baseUrls[resolvedConfig.effective.defaultProvider],
    resolvedConfig.effective.defaultModel,
    resolvedConfig.effective.defaultProvider,
    showSetup,
  ]);

  const appendLocalAssistantMessage = (content: unknown) => {
    setMessages((current) => [...current, createLocalMessage('assistant', toDisplayString(content))]);
  };

  const appendLocalUserMessage = (content: unknown) => {
    setMessages((current) => [...current, createLocalMessage('user', toDisplayString(content))]);
  };

  const refreshConfig = async () => {
    const nextConfig = await configStore.load();
    setResolvedConfig(nextConfig);
    agent.setConfig(nextConfig);
  };

  const refreshPersistentTask = async () => {
    setActiveTask(await loadActiveTask(agent, taskStoreRef.current));
  };

  const refreshHomeDashboard = async () => {
    const mapManager = new RepoMapManager(cwd);
    const agentSessionManager = new MultiAgentSessionManager(cwd);
    const [projectScan, recentSessions, latestTask, mapStatus, agentSessions, agentLocks, memorySuggestions, teamRuns, setupConfigured] = await Promise.all([
      scanProject(cwd),
      sessionStoreRef.current.list(cwd),
      taskStoreRef.current.getLatestIncomplete(),
      mapManager.getMapStatus(cwd).catch(() => null),
      agentSessionManager.listSessions().catch(() => []),
      agentSessionManager.listFileLocks().catch(() => []),
      new MemorySuggestionStore(cwd).list().catch(() => []),
      new TeamArtifactStore(cwd).listRuns().catch(() => []),
      fileExists(getGlobalConfigPath()).catch(() => false),
    ]);
    const projectLanguages = projectScan.languages.length > 0
      ? projectScan.languages
      : ['TypeScript', 'JavaScript', 'Python'];
    const lspManager = new LspManager(resolvedConfig.effective.lsp);
    const lspBuilder = new LspContextBuilder(lspManager);
    const lspSummary = await lspBuilder.buildSummary(projectLanguages);
    const nextCodeIntelligenceSummary = lspBuilder.formatContextForSummary(lspSummary);
    const nextCodeIntelligenceStatus = lspSummary.mode === 'disabled'
      ? 'disabled'
      : `${lspSummary.mode}/${lspSummary.availableServers.length}srv/${lspSummary.sessions.length}sess/${lspSummary.cache.entries}cache`;

    setRepoMapStatus(
      mapStatus
        ? `${mapStatus.stale ? 'stale' : 'fresh'}${mapStatus.ageMs !== null ? `/${Math.max(0, Math.round(mapStatus.ageMs / 60000))}m` : ''}`
        : null,
    );
    setCodeIntelligenceSummary(nextCodeIntelligenceSummary);
    setCodeIntelligenceStatus(nextCodeIntelligenceStatus);

    const visibleActiveTask = latestTask && latestTask.status !== 'failed' ? latestTask : null;

    setHomeDashboard({
      activeTask: visibleActiveTask,
      agentLocks,
      agentSessions,
      approvalMode: resolvedConfig.effective.approvalMode,
      codeIntelligenceLine: nextCodeIntelligenceSummary,
      gitBranch,
      historyHint: 'Use /commands, /sessions, /history, or /resume to continue previous work.',
      localOnly: resolvedConfig.effective.localOnly,
      memorySuggestionCount: memorySuggestions.filter((suggestion) => suggestion.status === 'pending').length,
      memorySuggestionSummary: memorySuggestions.find((suggestion) => suggestion.status === 'pending')?.summary,
      modeLabel: activeModeLabel,
      model: resolvedConfig.effective.defaultModel,
      projectSummary: projectScan.projectSummary,
      provider: resolvedConfig.effective.defaultProvider,
      providerConfidence,
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        model: session.model,
        projectPath: session.projectPath,
        provider: session.provider,
        title: session.title,
        tokenUsage: session.tokenUsage,
        updatedAt: session.updatedAt,
      })),
      shortcuts: [
        {command: '/explain repo', description: 'Understand the project'},
        {command: '/fix tests', description: 'Find and fix failing tests'},
        {command: '/review diff', description: 'Review current changes'},
        {command: '/team plan fix failing tests', description: 'Plan a team workflow'},
        {command: '/setup', description: 'Configure provider/profile'},
      ],
      setupNeeded: !setupConfigured,
      teamRunCount: teamRuns.length,
      title: 'ApeironCode',
      type: 'home',
      workspacePath: cwd,
    });
  };

  const refreshSessionState = () => {
    setMessages([...agent.messages]);
    setToolCalls([...agent.toolCalls]);
    setActiveModeLabel(formatEffectiveModeLabel({effectiveMode: agent.currentSession.mode, reason: agent.currentSession.modeReason ?? 'default'}));
    void refreshPersistentTask();
    void refreshHomeDashboard();
  };

  const loadReviewCockpitDashboard = async (
    teamRunId: string,
    actionBanner?: Extract<DashboardView, {type: 'review-cockpit'}>['actionBanner'],
  ): Promise<Extract<DashboardView, {type: 'review-cockpit'}>> => {
    const artifactStore = new TeamArtifactStore(cwd);
    const workspaceManager = new SubagentWorkspaceManager(cwd);
    const memoryStore = new MemorySuggestionStore(cwd);
    const [run, workspaces, mergePlans, memorySuggestions] = await Promise.all([
      artifactStore.getRun(teamRunId),
      workspaceManager.findByTeamRun(teamRunId).catch(() => []),
      workspaceManager.createMergePlan(teamRunId).catch(() => []),
      memoryStore.list().catch(() => []),
    ]);
    const relatedMemorySuggestions = memorySuggestions.filter((suggestion) =>
      suggestion.relatedSessionId === teamRunId
      || suggestion.proposedFacts.some((fact) => JSON.stringify(fact).includes(teamRunId)),
    );

    return {
      actionBanner,
      mergePlans,
      memorySuggestions: relatedMemorySuggestions.length > 0 ? relatedMemorySuggestions : memorySuggestions.filter((suggestion) => suggestion.status === 'pending').slice(0, 8),
      run,
      title: `Review Cockpit: ${teamRunId}`,
      type: 'review-cockpit',
      workspaces,
    };
  };

  useEffect(() => {
    if (showSetup) {
      setHomeDashboard(null);
      return;
    }

    void refreshHomeDashboard().catch((error) => {
      setErrorDisplay({
        type: 'config-error',
        title: 'Dashboard Load Error',
        message: formatUnknownError(error) || 'Failed to load workspace info',
      });
    });
  }, [cwd, showSetup]);

  const runPrompt = async (prompt: string, modeOverride?: AgentMode) => {
    setIsBusy(true);
    setStatus('Working');

    try {
      const requestedMode = modeOverride ?? (activeMode === 'chat' ? undefined : activeMode);
      const modeResolution = resolveEffectiveMode({
        allowPromptInference: requestedMode === undefined,
        explicitMode: requestedMode,
        prompt,
        sessionMode: activeMode,
      });
      setActiveModeLabel(formatEffectiveModeLabel(modeResolution));
      agent.setMode(activeMode);
      const result = await agent.run(
        {
          allowModeInference: requestedMode === undefined,
          model: resolvedConfig.effective.defaultModel,
          mode: requestedMode,
          prompt,
          providerName: resolvedConfig.effective.defaultProvider,
        },
        {
          onMessage: (message) => {
            setMessages((current) => [...current, message]);
          },
          onStatus: (nextStatus) => {
            setStatus(nextStatus);
          },
          onToolCall: (toolCall) => {
            setToolCalls((current) => [...current, toolCall]);
          },
          onToolResult: (toolCall) => {
            setToolCalls((current) =>
              current.map((candidate) =>
                candidate.id === toolCall.id ? {...toolCall} : candidate,
              ),
            );
          },
        },
      );

      refreshSessionState();
      setUsageSummary(formatRecordedUsageSummary(agent.currentSession.tokenUsage) ?? formatUsageSummary(prompt, result.finalMessage.content));
    } catch (error) {
      const errorMsg = formatUnknownError(error) || 'Unknown error';
      setErrorDisplay({
        type: 'provider-error',
        title: 'Agent Error',
        message: errorMsg,
      });
    } finally {
      setIsBusy(false);
      setStatus('Ready');
    }
  };

  const runTool = async (toolName: string, input: Record<string, unknown>) => {
    setIsBusy(true);
    setStatus(`Running ${toolName}`);

    try {
      await agent.invokeTool(toolName, input, {
        onMessage: (message) => {
          setMessages((current) => [...current, message]);
        },
        onStatus: (nextStatus) => {
          setStatus(nextStatus);
        },
        onToolCall: (toolCall) => {
          setToolCalls((current) => [...current, toolCall]);
        },
        onToolResult: (toolCall) => {
          setToolCalls((current) =>
            current.map((candidate) =>
              candidate.id === toolCall.id ? {...toolCall} : candidate,
            ),
          );
        },
      });
      refreshSessionState();
      setUsageSummary(formatRecordedUsageSummary(agent.currentSession.tokenUsage));
    } catch (error) {
      const errorMsg = formatUnknownError(error) || 'Unknown error';
      setErrorDisplay({
        type: 'tool-failure',
        title: `Tool Error: ${toolName}`,
        message: errorMsg,
      });
    } finally {
      setIsBusy(false);
      setStatus('Ready');
    }
  };

  const handleApprovalSubmit = (value: string) => {
    const request = pendingApproval;
    const resolver = approvalResolverRef.current;
    if (!request || !resolver) {
      return;
    }

    const approved = request.requiresExtraConfirmation
      ? value.trim() === 'YES'
      : /^y(es)?$/iu.test(value.trim());

    resolver({approved});
    approvalResolverRef.current = null;
    setPendingApproval(null);
    setApprovalInput('');
    setStatus(approved ? 'Approved' : 'Denied');
  };

  const handleSetupSelect = async (option: SetupOptionId) => {
    await applySetupOption({appendLocalAssistantMessage, configStore, option});
    await refreshConfig();
    setShowSetup(false);
    setStatus('Ready');
  };

  const handleMemoryWrite = async (text: string, mode: 'append' | 'replace') => {
    const memoryPath = getProjectMemoryPath(cwd);
    const currentMemory = resolvedConfig.projectMemory ?? '';
    const nextContent = mode === 'append'
      ? `${currentMemory.trim()}${currentMemory.trim() ? '\n\n' : ''}${text.trim()}\n`
      : `${text.trim()}\n`;
    await runTool('write_file', {
      content: nextContent,
      path: memoryPath,
    });
    await refreshConfig();
    setMemoryInputMode(null);
  };

  const handleSlashCommand = async (rawInput: string): Promise<boolean> => {
    return executeSlashCommand(rawInput, {
      agent,
      appendLocalAssistantMessage,
      configStore,
      cwd,
      exit,
      getCodeIntelligenceSummary: () => codeIntelligenceSummary,
      getCurrentMode: () => activeMode,
      getResolvedConfig: () => resolvedConfig,
      providerRegistry: registry,
      refreshConfig,
      refreshSessionState,
      runPrompt,
      runTool,
      sessionStore: sessionStoreRef.current,
      setDashboard,
      expandHome: () => setHomeExpanded(true),
      setCurrentMode: (mode) => {
        agent.setMode(mode);
        setActiveMode(mode);
        setActiveModeLabel(mode);
      },
      setMemoryInputMode,
      setStatus,
      toolRegistry,
    });
  };

  const handleInputSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isBusy || showSetup || pendingApproval) {
      return;
    }

    setErrorDisplay(null);
    setInputValue('');

    if (memoryInputMode) {
      await handleMemoryWrite(trimmed, memoryInputMode);
      appendLocalAssistantMessage(
        memoryInputMode === 'append' ? 'Project memory updated.' : 'Project memory replaced.',
      );
      return;
    }

    if (trimmed.startsWith('/')) {
      appendLocalUserMessage(trimmed);
      setIsBusy(true);
      setStatus(`Running ${trimmed.split(/\s+/u)[0]}`);
      try {
        const handled = await handleSlashCommand(trimmed);
        if (!handled) {
          appendLocalAssistantMessage(`Unknown command: ${trimmed}\nTry /commands beginner or /help.`);
        }
      } catch (error) {
        const errorMsg = formatUnknownError(error) || 'Unknown command error';
        setErrorDisplay({
          type: 'config-error',
          title: `Command Error: ${trimmed.split(/\s+/u)[0]}`,
          message: errorMsg,
        });
        appendLocalAssistantMessage(`Command failed: ${errorMsg}`);
      } finally {
        setIsBusy(false);
        setStatus('Ready');
      }
      return;
    }

    await runPrompt(trimmed);
  };

  const autoHome = messages.length === 0 && !showSetup ? homeDashboard : null;
  const visibleDashboard = dashboard
    ?? (autoHome ? {...autoHome, compact: !homeExpanded} : null);
  const dashboardNode = renderDashboard({
    appendLocalAssistantMessage,
    cwd,
    loadReviewCockpitDashboard,
    refreshSessionState,
    setDashboard,
    setStatus,
    visibleDashboard,
  });

  return (
    <Box flexDirection="column">
      <ChatScreen
        activeMode={activeModeLabel}
        activeTaskId={activeTask?.id}
        activeTaskStatus={activeTask?.status}
        agentLocks={homeDashboard?.agentLocks}
        agentSessions={homeDashboard?.agentSessions}
        approvalInput={approvalInput}
        approvalMode={resolvedConfig.effective.approvalMode}
        codeIntelligenceStatus={codeIntelligenceStatus}
        cwd={cwd}
        dashboard={dashboardNode}
        errorDisplay={errorDisplay}
        eventBus={agent.eventBus}
        gitBranch={gitBranch}
        inputValue={inputValue}
        isBusy={isBusy}
        messages={messages}
        model={resolvedConfig.effective.defaultModel}
        pendingApproval={pendingApproval}
        providerConfidence={providerConfidence}
        provider={resolvedConfig.effective.defaultProvider}
        repoMapStatus={repoMapStatus}
        sessionId={agent.sessionId}
        showSetup={showSetup}
        status={status}
        todos={activeTask
          ? activeTask.steps.map((step) => ({
              content: step.title,
              id: step.id,
              note: step.description,
              status: mapTaskStatusToTodoStatus(step.status),
              updatedAt: step.completedAt ?? step.startedAt ?? activeTask.updatedAt,
            }))
          : agent.currentSession.taskState?.todos ?? []}
        toolCalls={toolCalls}
        usageSummary={usageSummary}
        onApprovalChange={setApprovalInput}
        onApprovalSubmit={handleApprovalSubmit}
        onInputChange={setInputValue}
        onInputSubmit={(value) => {
          void handleInputSubmit(value);
        }}
        onSetupSelect={(option) => {
          void handleSetupSelect(option);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>Approval required for edits, writes & commands · APEIRONCODE_DEBUG=1 for full diffs/details</Text>
      </Box>
    </Box>
  );
};
