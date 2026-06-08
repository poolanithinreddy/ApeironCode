import path from 'node:path';
import process from 'node:process';

import {render} from 'ink';
import React from 'react';

import {Agent} from '../../agent/Agent.js';
import {formatEffectiveModeLabel, resolveEffectiveMode} from '../../agent/effectiveMode.js';
import {MemoryManager} from '../../agent/memoryManager.js';
import type {AgentMode} from '../../agent/types.js';
import {rankRelevantFiles} from '../../agent/relevance.js';
import type {ConversationSession} from '../../agent/session.js';
import {formatCost, formatTokens} from '../../providers/costTracker.js';
import type {ModelRole} from '../../providers/modelCatalog.js';
import {
  formatModelDisplayEntries,
  formatModelRecommendations,
  formatProviderCatalog,
  formatProviderSetupDetails,
  listModelDisplayEntries,
  listProviderStatuses,
  recommendModels,
} from '../../providers/providerUx.js';
import {formatFallbackChain, parseProviderModelRef, resolveProviderChain} from '../../providers/fallbacks.js';
import {formatProviderFallbackSimulation, simulateProviderFallback} from '../../providers/fallbackSimulation.js';
import {
  checkOllamaStatus,
  formatOllamaModels,
  formatOllamaPullHint,
  formatOllamaRecommendations,
  formatOllamaStatus,
} from '../../providers/ollamaUx.js';
import {RepoMapManager} from '../../context/repoMap.js';
import {buildProjectIndex} from '../../context/indexer.js';
import {packContext, formatPackedContext} from '../../context/contextPacker.js';
import {inferDependencyGraph} from '../../context/dependencyGraph.js';
import {summarizeFile} from '../../context/fileSummaries.js';
import {RepoBrainIndexStore} from '../../context/indexStore.js';
import {buildTokenBudgetReport, formatTokenBudgetReport} from '../../context/tokenBudget.js';
import {
  buildRepoIntelligenceReport,
  formatDetailedSymbolMatches,
  formatRepoIntelligenceReport,
  searchProjectSymbolsDetailed,
} from '../../context/repoIntelligence.js';
import {scanProject} from '../../context/scanner.js';
import {formatDoctorReport, runDoctor, runProviderSmokeTest} from '../../diagnostics/doctor.js';
import {formatCostBrowser, formatHistoryBrowser} from '../../history/browser.js';
import {formatSearchResults, searchWorkspaceHistory, type SearchScope} from '../../history/searchIndex.js';
import {formatMcpEndpointList, formatMcpTestResult, formatMcpToolList} from '../../mcp/display.js';
import {findConfiguredMcpEndpoint, listConfiguredMcpEndpoints} from '../../mcp/endpoints.js';
import {McpClient} from '../../mcp/client.js';
import {McpSessionV2} from '../../mcp/sessionV2.js';
import {FileMcpTokenStore, getMcpAuthStatus, ensureMcpAuthToken, runMcpDeviceLogin} from '../../mcp/auth/index.js';
import {summarizeMcpPermissions} from '../../mcp/permissions.js';
import {sharedMcpServerManager} from '../../mcp/manager.js';
import {SessionStore} from '../../sessions/store.js';
import {buildContinuationPrompt, formatTaskPlanList, formatTaskPlanSummary} from '../../tasks/taskSummary.js';
import {TaskStore} from '../../tasks/taskStore.js';
import type {TaskPlan} from '../../tasks/types.js';
import {ConfigStore, type ApprovalMode, type ResolvedConfig} from '../../config/config.js';
import {providerRegistry} from '../../providers/registry.js';
import {createDefaultToolRegistry} from '../../tools/registry.js';
import {formatPromptText, toDisplayString} from '../../utils/display.js';
import {fileExists} from '../../utils/fs.js';
import {logger} from '../../utils/logger.js';
import {getGlobalConfigPath} from '../../utils/paths.js';
import {loadPluginCatalog} from '../../plugins/loader.js';
import {formatPluginCatalog} from '../../plugins/mcp.js';
import {formatToolList, loadExternalTools} from '../../tools/external.js';
import {queryEditHistory} from '../../tools/patch/editHistory.js';
import {formatAgents, formatAgent, formatSubagentRun, formatTeamPlan, formatTeamRunResult} from '../../agents/format.js';
import {TeamEventLog} from '../../agents/eventLog.js';
import {getAgent, listAgents} from '../../agents/registry.js';
import {runSubagentDryRun} from '../../agents/subagentRunner.js';
import {createTeamPlan} from '../../agents/teamPlanner.js';
import {runTeamSequential} from '../../agents/teamRunner.js';
import {formatParallelReadonlyLanePlan, planParallelReadonlyLanes} from '../../agents/parallelLanes.js';
import {formatIgnoredFiles, formatMergePlans, formatWorkspaces} from '../../agents/workspace/format.js';
import {SubagentWorkspaceManager} from '../../agents/workspace/workspaceManager.js';
import {formatConflictReport} from '../../agents/workspace/conflictReport.js';
import {exportTeamPatch, formatPatchValidation, formatResolutionState, loadResolutionState, setResolution, validateTeamPatch} from '../../agents/workspace/resolution.js';
import {formatMergeResolution} from '../../agents/workspace/resolutionFormat.js';
import {listTeamArtifacts, showTeamArtifact, showTeamRun, browseTeamRuns} from '../../agents/artifacts/browser.js';
import {TeamArtifactStore} from '../../agents/artifacts/store.js';
import {formatArtifactBrowser} from '../../ui/artifactBrowserViewModel.js';
import {buildTeamReviewViewModel, formatTeamReview} from '../../ui/teamReviewViewModel.js';
import {createReviewCockpitState} from '../../ui/reviewCockpitState.js';
import {buildReviewCockpitViewModel, formatReviewCockpit} from '../../ui/reviewCockpitViewModel.js';
import {listConnectorStatuses} from '../../connectors/registry.js';
import {GitHubClient} from '../../connectors/github/client.js';
import {formatConnectorStatus, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview} from '../../connectors/github/format.js';
import {formatGitHubActionsRuns, formatGitHubCiExplanation, listGitHubActionsJobs, listGitHubActionsRuns} from '../../connectors/github/actions.js';
import {createGitHubIssue, createGitHubIssueComment, getGitHubIssue, listGitHubIssues} from '../../connectors/github/issues.js';
import {buildLocalPrReviewReport, buildPrSummaryReport, createGitHubPull, getGitHubPull, listGitHubPullFiles, listGitHubPulls} from '../../connectors/github/pulls.js';
import {detectGitHubRepo} from '../../connectors/github/repos.js';
import {parseRawActionEvent} from '../../githubAction/events.js';
import {loadActionConfigFromEnv} from '../../githubAction/config.js';
import {runActionFromEvent} from '../../githubAction/runner.js';
import {resolveMentionFromComment} from '../../githubAutomation/commentCommands.js';
import {runCiFixAutomation} from '../../githubAutomation/ciFix.js';
import {runIssueToPrAutomation} from '../../githubAutomation/issueToPr.js';
import {loadAutomationPermissionsFromEnv} from '../../githubAutomation/permissions.js';
import {runPrReviewAutomation} from '../../githubAutomation/prReview.js';
import {buildAutomationSummary} from '../../githubAutomation/summary.js';

export {
  McpClient,
  McpSessionV2,
  FileMcpTokenStore,
  ensureMcpAuthToken,
  getMcpAuthStatus,
  runMcpDeviceLogin,
  buildAutomationSummary,
  loadActionConfigFromEnv,
  loadAutomationPermissionsFromEnv,
  parseRawActionEvent,
  resolveMentionFromComment,
  runActionFromEvent,
  runCiFixAutomation,
  runIssueToPrAutomation,
  runPrReviewAutomation,
  summarizeMcpPermissions,
};
import {formatMemoryGraphSummary, formatMemoryReview, formatRelatedMemories} from '../../memory/graphFormat.js';
import {pruneMemoryGraph, reviewMemoryGraph, upsertMemoryFact} from '../../memory/graph.js';
import {searchMemoryGraph, explainMemorySelection} from '../../memory/graphSearch.js';
import {MemoryGraphStore} from '../../memory/graphStore.js';
import {formatMemorySuggestionDetail, formatMemorySuggestions, MemorySuggestionStore} from '../../memory/suggestions.js';
import {forgetSessionMemories, formatMemoryFindings, formatMemorySourceTrace, rollbackMemoryItem} from '../../memory/control.js';
import {formatMemoryReviewText} from '../../ui/memoryReviewViewModel.js';
import {formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates} from '../../skills/format.js';
import {createSkillFromDescription, createStarterSkill} from '../../skills/generator.js';
import {buildSkillRunPlan} from '../../skills/runner.js';
import {SkillStore} from '../../skills/store.js';
import {HookRegistry} from '../../hooks/registry.js';
import {runHook} from '../../hooks/runner.js';
import {formatHookEvents, formatHookRunResult, formatHooks} from '../../hooks/format.js';
import {HookEventLog} from '../../hooks/eventLog.js';
import {getWorkflowRecipe, listWorkflowRecipes} from '../../workflows/runtime/recipeRegistry.js';
import {formatWorkflowRecipe, formatWorkflowRecipeList, runWorkflowRecipe} from '../../workflows/runtime/recipeRunner.js';
import {formatWorkflowReport, WorkflowReportStore} from '../../workflows/runtime/reports.js';
import {parsePermissionRules} from '../../safety/permissionParser.js';
import {evaluatePermissionRules} from '../../safety/permissionMatcher.js';
import {formatApprovalReview} from '../../safety/approvalFormat.js';
import {formatSecurityLimits} from '../../safety/securityStatus.js';
import {applySetupProfile, formatSetupResult, formatSetupStatus, getSetupStatus, resetSetup} from '../../setup/setup.js';
import {detectSandboxStatus} from '../../sandbox/detector.js';
import {formatSandboxStatus} from '../../sandbox/format.js';
import {formatEvalList, formatEvalReport} from '../../evals/format.js';
import {loadLastEvalResult} from '../../evals/results.js';
import {loadLatestEvalReport, runAllSuites, runEval, runSuiteById} from '../../evals/runner.js';
import {getEvalSuite} from '../../evals/suites/index.js';
import {validateConnectorEnv} from '../../connectors/envValidation.js';
import {App} from '../../ui/App.js';
import type {
  CostCliOptions,
  HistoryCliOptions,
  RootCliOptions,
} from '../args.js';
export const applyRuntimeOverrides = (
  config: ResolvedConfig,
  options: RootCliOptions,
): ResolvedConfig => {
  const approvalMode: ApprovalMode | undefined = options.dangerouslySkipApprovals
    ? 'bypass'
    : options.approvalMode;

  return {
    ...config,
    effective: {
      ...config.effective,
      approvalMode: approvalMode ?? config.effective.approvalMode,
      defaultModel: options.model ?? config.effective.defaultModel,
      defaultProvider: options.provider ?? config.effective.defaultProvider,
    },
  };
};

export const formatJson = (value: unknown): void => {
  process.stdout.write(`${toDisplayString(value)}\n`);
};

export const formatRelevantFileList = (files: Awaited<ReturnType<typeof rankRelevantFiles>>): string => {
  if (files.length === 0) {
    return 'No relevant files found.';
  }

  return files
    .map((file) => `${file.path} | score=${file.score} | reasons=${file.reason.join(', ') || 'heuristic match'}`)
    .join('\n');
};

export const formatUsageSummary = (usage?: ConversationSession['tokenUsage']): string => {
  if (!usage?.totalTokens) {
    return 'No usage data recorded for the latest saved session.';
  }

  return [
    `Input tokens: ${formatTokens(usage.inputTokens ?? 0)}`,
    `Output tokens: ${formatTokens(usage.outputTokens ?? 0)}`,
    `Total tokens: ${formatTokens(usage.totalTokens ?? 0)}`,
    `Estimated cost: ${formatCost(usage.estimatedCostUsd)}`,
    `Breakdown: ${usage.breakdown && usage.breakdown.length > 0
      ? usage.breakdown.map((entry) => `${entry.provider}/${entry.model} (${entry.calls} call${entry.calls === 1 ? '' : 's'}, ${formatTokens(entry.inputTokens + entry.outputTokens)}, ${formatCost(entry.estimatedCostUsd)})`).join('; ')
      : 'none'}`,
  ].join('\n');
};

export const loadMcpEndpointCatalog = async (
  configStore: ConfigStore,
  cwd: string,
) => {
  const config = await configStore.load();
  const plugins = await loadPluginCatalog({config: config.effective, cwd});
  const endpoints = listConfiguredMcpEndpoints({config: config.effective, plugins});
  return {config, endpoints, plugins};
};

export const normalizeSearchScope = (scope?: string): SearchScope => {
  if (scope === 'edit' || scope === 'memory' || scope === 'session' || scope === 'task') {
    return scope;
  }

  return 'all';
};

export const normalizeModelRole = (role?: string): ModelRole | undefined => {
  if (role === 'cheap' || role === 'coding' || role === 'fast' || role === 'local' || role === 'reasoning') {
    return role;
  }

  return undefined;
};

export const loadMemoryWhyText = async (cwd: string, sessionStore: SessionStore): Promise<string> => {
  const memoryManager = new MemoryManager(cwd);
  const latestSession = (await sessionStore.list(cwd))[0] ?? null;
  if (latestSession?.sessionMemory?.memoryWhy?.length) {
    return memoryManager.formatMemoryWhy(latestSession.sessionMemory.memoryWhy);
  }

  const [projectMemory, globalMemory] = await Promise.all([
    memoryManager.loadProjectMemory(),
    memoryManager.loadGlobalMemory(),
  ]);
  return memoryManager.formatMemoryWhy(memoryManager.describeLoadedMemory({globalMemory, projectMemory}));
};

export const invokeCliTool = async (
  cwd: string,
  config: ResolvedConfig,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> => {
  const agent = createAgent(cwd, config);
  const result = await agent.invokeTool(toolName, input);
  return [result.summary, result.output].filter(Boolean).join('\n\n');
};

export const createAgent = (
  cwd: string,
  config: ResolvedConfig,
  session?: ConversationSession | null,
  toolRegistry = createDefaultToolRegistry(),
) => {
  const agent = new Agent({
    config,
    cwd,
    providerRegistry,
    toolRegistry,
  });

  if (session) {
    agent.loadSession(session);
  }

  return agent;
};

export const formatSessionSummary = (session: {
  id: string;
  model: string;
  projectPath: string;
  provider: string;
  updatedAt: string;
}): string => {
  return [
    session.id,
    `${session.provider}/${session.model}`,
    session.projectPath,
    session.updatedAt,
  ].join(' | ');
};

export const loadSelectedTask = async (
  taskStore: TaskStore,
  taskId?: string,
  fallback: 'latest' | 'latest-incomplete' | 'latest-incomplete-or-latest' = 'latest-incomplete-or-latest',
): Promise<TaskPlan | null> => {
  return taskStore.resolve(taskId, {fallback});
};

export const formatMissingTaskMessage = (taskId?: string, incompleteOnly = false): string => {
  if (taskId) {
    return `No task plan found for ${taskId}.`;
  }

  return incompleteOnly
    ? 'No incomplete task plan found for this project.'
    : 'No persisted task plans found for this project.';
};

export const loadCostSessions = async (
  sessionStore: SessionStore,
  cwd: string,
  options: CostCliOptions,
) => {
  if (options.session) {
    return sessionStore.select({sessionId: options.session});
  }

  if (options.all) {
    return sessionStore.select({all: true});
  }

  if (options.project) {
    return sessionStore.select({projectPath: cwd});
  }

  return (await sessionStore.select({projectPath: cwd})).slice(0, 1);
};

export const buildRepoBrainIndexForCli = async (cwd: string, config: ResolvedConfig) => {
  const projectIndex = await buildProjectIndex(cwd, config.ignorePatterns);
  const candidates = projectIndex
    .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|md|json)$/u.test(file.path))
    .slice(0, Math.max(1, Math.min(config.effective.maxContextFiles, 50)));
  const files = await Promise.all(candidates.map((file) => summarizeFile(cwd, file.path)));
  const dependencies = inferDependencyGraph(files);
  const store = new RepoBrainIndexStore(cwd);
  return store.save({dependencies, files});
};

export const createGitHubClientForCli = async (cwd: string): Promise<GitHubClient | null> => {
  const repo = await detectGitHubRepo(cwd);
  return repo ? new GitHubClient({repo}) : null;
};

export const parseIssueNumber = (value: string): number => {
  const match = value.match(/(?:issues|pull)\/(\d+)(?:\b|$)/u);
  const number = Number.parseInt(match?.[1] ?? value.replace(/^#/u, ''), 10);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Invalid GitHub issue or PR number: ${value}`);
  }
  return number;
};

export const shouldApproveCliWrite = (config: ResolvedConfig): boolean =>
  config.effective.approvalMode === 'bypass' || config.effective.approvalMode === 'trusted';

export const getCostScopeLabel = (options: CostCliOptions): string => {
  if (options.session) {
    return `session ${options.session}`;
  }

  if (options.all) {
    return 'all saved sessions';
  }

  if (options.project) {
    return 'this project';
  }

  return 'latest saved session in this project';
};

export const getHistorySessionLabel = (options: HistoryCliOptions): string => {
  if (options.session) {
    return `session ${options.session}`;
  }

  return options.all ? 'all saved sessions' : 'saved sessions in this project';
};

export const runOneShot = async (
  cwd: string,
  prompt: string,
  config: ResolvedConfig,
  session?: ConversationSession | null,
  mode?: AgentMode,
  options?: {planId?: string; planOnly?: boolean},
): Promise<void> => {
  const agent = createAgent(cwd, config, session);
  const modeResolution = resolveEffectiveMode({
    allowPromptInference: mode === undefined,
    explicitMode: mode,
    prompt,
    sessionMode: agent.mode,
  });
  const activeMode = formatEffectiveModeLabel(modeResolution);
  logger.info(`Provider: ${config.effective.defaultProvider} | Model: ${config.effective.defaultModel}`);
  logger.info(`Mode: ${activeMode}`);

  const result = await agent.run(
    {
      allowModeInference: mode === undefined,
      model: config.effective.defaultModel,
      mode,
      planId: options?.planId,
      planOnly: options?.planOnly,
      prompt,
      providerName: config.effective.defaultProvider,
    },
    {
      onStatus: (status) => {
        logger.debug(`status: ${status}`);
      },
      onToolCall: (toolCall) => {
        logger.info(`tool ${toolCall.toolName}`);
      },
      onToolResult: (toolCall) => {
        logger.info(`${toolCall.toolName}: ${toolCall.result?.summary ?? toolCall.error ?? toolCall.status}`);
      },
    },
  );

  process.stdout.write(`${formatPromptText(result.finalMessage.content).trim()}\n`);
};

export const runInteractive = async (
  cwd: string,
  config: ResolvedConfig,
  session?: ConversationSession | null,
  initialMode?: AgentMode,
): Promise<void> => {
  const configStore = new ConfigStore(cwd);
  const toolRegistry = createDefaultToolRegistry();
  const needsSetup = !(await fileExists(getGlobalConfigPath()))
    || config.effective.defaultProvider === 'mock';
  const instance = render(
    React.createElement(App, {
      configStore,
      cwd,
      initialConfig: config,
      initialMode,
      initialSession: session ?? null,
      needsSetup,
      providerRegistry,
      toolRegistry,
    }),
  );

  await instance.waitUntilExit();
};

export {Agent, App, ConfigStore, GitHubClient, HookEventLog, HookRegistry, MemoryGraphStore, MemoryManager, MemorySuggestionStore, React, RepoBrainIndexStore, RepoMapManager, SessionStore, SkillStore, SubagentWorkspaceManager, TaskStore, TeamArtifactStore, TeamEventLog, WorkflowReportStore, applySetupProfile, browseTeamRuns, buildContinuationPrompt, buildLocalPrReviewReport, buildPrSummaryReport, buildProjectIndex, buildRepoIntelligenceReport, buildReviewCockpitViewModel, buildSkillRunPlan, buildTeamReviewViewModel, buildTokenBudgetReport, checkOllamaStatus, createDefaultToolRegistry, createGitHubIssue, createGitHubIssueComment, createGitHubPull, createReviewCockpitState, createSkillFromDescription, createStarterSkill, createTeamPlan, detectGitHubRepo, detectSandboxStatus, evaluatePermissionRules, explainMemorySelection, exportTeamPatch, fileExists, findConfiguredMcpEndpoint, forgetSessionMemories, formatAgent, formatAgents, formatApprovalReview, formatArtifactBrowser, formatConflictReport, formatConnectorStatus, formatCost, formatCostBrowser, formatDetailedSymbolMatches, formatDoctorReport, formatEffectiveModeLabel, formatEvalList, formatEvalReport, formatFallbackChain, formatGitHubActionsRuns, formatGitHubCiExplanation, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview, formatHistoryBrowser, formatHookEvents, formatHookRunResult, formatHooks, formatIgnoredFiles, formatMcpEndpointList, formatMcpTestResult, formatMcpToolList, formatMemoryFindings, formatMemoryGraphSummary, formatMemoryReview, formatMemoryReviewText, formatMemorySourceTrace, formatMemorySuggestionDetail, formatMemorySuggestions, formatMergePlans, formatMergeResolution, formatModelDisplayEntries, formatModelRecommendations, formatOllamaModels, formatOllamaPullHint, formatOllamaRecommendations, formatOllamaStatus, formatPackedContext, formatParallelReadonlyLanePlan, formatPatchValidation, formatPluginCatalog, formatPromptText, formatProviderCatalog, formatProviderFallbackSimulation, formatProviderSetupDetails, formatRelatedMemories, formatRepoIntelligenceReport, formatResolutionState, formatReviewCockpit, formatSandboxStatus, formatSearchResults, formatSecurityLimits, formatSetupResult, formatSetupStatus, formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates, formatSubagentRun, formatTaskPlanList, formatTaskPlanSummary, formatTeamPlan, formatTeamReview, formatTeamRunResult, formatTokenBudgetReport, formatTokens, formatToolList, formatWorkflowRecipe, formatWorkflowRecipeList, formatWorkflowReport, formatWorkspaces, getAgent, getEvalSuite, getGitHubIssue, getGitHubPull, getGlobalConfigPath, getSetupStatus, getWorkflowRecipe, inferDependencyGraph, listAgents, listConfiguredMcpEndpoints, listConnectorStatuses, listGitHubActionsJobs, listGitHubActionsRuns, listGitHubIssues, listGitHubPullFiles, listGitHubPulls, listModelDisplayEntries, listProviderStatuses, listTeamArtifacts, listWorkflowRecipes, loadExternalTools, loadLastEvalResult, loadLatestEvalReport, loadPluginCatalog, loadResolutionState, logger, packContext, parsePermissionRules, parseProviderModelRef, path, planParallelReadonlyLanes, process, providerRegistry, pruneMemoryGraph, queryEditHistory, rankRelevantFiles, recommendModels, render, resetSetup, resolveEffectiveMode, resolveProviderChain, reviewMemoryGraph, rollbackMemoryItem, runAllSuites, runDoctor, runEval, runHook, runProviderSmokeTest, runSubagentDryRun, runSuiteById, runTeamSequential, runWorkflowRecipe, scanProject, searchMemoryGraph, searchProjectSymbolsDetailed, searchWorkspaceHistory, setResolution, sharedMcpServerManager, showTeamArtifact, showTeamRun, simulateProviderFallback, summarizeFile, toDisplayString, upsertMemoryFact, validateConnectorEnv, validateTeamPatch};
