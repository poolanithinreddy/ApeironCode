/* eslint-disable @typescript-eslint/no-unused-vars */
import type {MergeResolutionAction} from '../../agents/workspace/resolution.js';
import type {ProviderFallbackSimulationKind} from '../../providers/fallbackSimulation.js';
import type {AgentMode} from '../../agent/types.js';
import type {TaskPlan} from '../../tasks/types.js';
import type {CostCliOptions, ContextRefreshCliOptions, ConfigCommandKey, ConfigSetOptions, DoctorCliOptions, HistoryCliOptions, ProviderTestCliOptions, RevertCliOptions, RootCliOptions, SearchCliOptions, SessionCliOptions} from '../args.js';
import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import * as shared from './shared.js';

const {Agent, App, ConfigStore, GitHubClient, HookEventLog, HookRegistry, MemoryGraphStore, MemoryManager, MemorySuggestionStore, React, RepoBrainIndexStore, RepoMapManager, SessionStore, SkillStore, SubagentWorkspaceManager, TaskStore, TeamArtifactStore, TeamEventLog, WorkflowReportStore, applyRuntimeOverrides, applySetupProfile, browseTeamRuns, buildContinuationPrompt, buildLocalPrReviewReport, buildPrSummaryReport, buildProjectIndex, buildRepoBrainIndexForCli, buildRepoIntelligenceReport, buildReviewCockpitViewModel, buildSkillRunPlan, buildTeamReviewViewModel, buildTokenBudgetReport, checkOllamaStatus, createAgent, createDefaultToolRegistry, createGitHubClientForCli, createGitHubIssue, createGitHubIssueComment, createGitHubPull, createReviewCockpitState, createSkillFromDescription, createStarterSkill, createTeamPlan, detectGitHubRepo, detectSandboxStatus, evaluatePermissionRules, explainMemorySelection, exportTeamPatch, fileExists, findConfiguredMcpEndpoint, forgetSessionMemories, formatAgent, formatAgents, formatApprovalReview, formatArtifactBrowser, formatConflictReport, formatConnectorStatus, formatCost, formatCostBrowser, formatDetailedSymbolMatches, formatDoctorReport, formatEffectiveModeLabel, formatEvalList, formatEvalReport, formatFallbackChain, formatGitHubActionsRuns, formatGitHubCiExplanation, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview, formatHistoryBrowser, formatHookEvents, formatHookRunResult, formatHooks, formatIgnoredFiles, formatJson, formatMcpEndpointList, formatMcpTestResult, formatMcpToolList, formatMemoryFindings, formatMemoryGraphSummary, formatMemoryReview, formatMemoryReviewText, formatMemorySourceTrace, formatMemorySuggestionDetail, formatMemorySuggestions, formatMergePlans, formatMergeResolution, formatMissingTaskMessage, formatModelDisplayEntries, formatModelRecommendations, formatOllamaModels, formatOllamaPullHint, formatOllamaRecommendations, formatOllamaStatus, formatPackedContext, formatParallelReadonlyLanePlan, formatPatchValidation, formatPluginCatalog, formatPromptText, formatProviderCatalog, formatProviderFallbackSimulation, formatProviderSetupDetails, formatRelatedMemories, formatRelevantFileList, formatRepoIntelligenceReport, formatResolutionState, formatReviewCockpit, formatSandboxStatus, formatSearchResults, formatSecurityLimits, formatSessionSummary, formatSetupResult, formatSetupStatus, formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates, formatSubagentRun, formatTaskPlanList, formatTaskPlanSummary, formatTeamPlan, formatTeamReview, formatTeamRunResult, formatTokenBudgetReport, formatTokens, formatToolList, formatUsageSummary, formatWorkflowRecipe, formatWorkflowRecipeList, formatWorkflowReport, formatWorkspaces, getAgent, getCostScopeLabel, getGitHubIssue, getGitHubPull, getGlobalConfigPath, getHistorySessionLabel, getSetupStatus, getWorkflowRecipe, inferDependencyGraph, invokeCliTool, listAgents, listConfiguredMcpEndpoints, listConnectorStatuses, listGitHubActionsJobs, listGitHubActionsRuns, listGitHubIssues, listGitHubPullFiles, listGitHubPulls, listModelDisplayEntries, listProviderStatuses, listTeamArtifacts, listWorkflowRecipes, loadCostSessions, loadExternalTools, loadLatestEvalReport, loadMcpEndpointCatalog, loadMemoryWhyText, loadPluginCatalog, loadResolutionState, loadSelectedTask, logger, normalizeModelRole, normalizeSearchScope, packContext, parseIssueNumber, parsePermissionRules, parseProviderModelRef, path, planParallelReadonlyLanes, process, providerRegistry, pruneMemoryGraph, queryEditHistory, rankRelevantFiles, recommendModels, render, resetSetup, resolveEffectiveMode, resolveProviderChain, reviewMemoryGraph, rollbackMemoryItem, runDoctor, runEval, runHook, runInteractive, runOneShot, runProviderSmokeTest, runSubagentDryRun, runTeamSequential, runWorkflowRecipe, scanProject, searchMemoryGraph, searchProjectSymbolsDetailed, searchWorkspaceHistory, setResolution, sharedMcpServerManager, shouldApproveCliWrite, showTeamArtifact, showTeamRun, simulateProviderFallback, summarizeFile, toDisplayString, upsertMemoryFact, validateTeamPatch} = shared;

export const createContextHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async contextRefresh(options: ContextRefreshCliOptions) {
      const mapManager = new RepoMapManager(cwd);
      const {map, status} = await mapManager.ensureFreshMap(cwd, {force: options.force});
      process.stdout.write(`Repository map status: ${status.stale ? 'stale' : 'fresh'}\n`);
      process.stdout.write(`Entries indexed: ${map.entries.length}\n`);
      process.stdout.write(`Reasons: ${status.staleReasons.length > 0 ? status.staleReasons.join('; ') : 'none'}\n`);
      process.stdout.write(`Important files: ${mapManager.getImportantFiles(map).join(', ') || 'none'}\n`);
    },
async contextIndex() {
      const config = await configStore.load();
      const index = await buildRepoBrainIndexForCli(cwd, config);
      process.stdout.write(`Repo brain indexed ${index.files.length} file summaries and ${index.dependencies.length} dependency edges.\n`);
    },
async contextBudget() {
      const store = new RepoBrainIndexStore(cwd);
      const index = await store.load();
      const report = buildTokenBudgetReport(index.files.map((file) => file.summary), 8_000);
      process.stdout.write(`${formatTokenBudgetReport(report)}\n`);
    },
async contextExplain(query: string) {
      const config = await configStore.load();
      const projectScan = await scanProject(cwd);
      const relevantFiles = await rankRelevantFiles({
        config: config.effective,
        cwd,
        projectScan,
        prompt: query,
      });
      const summaries = await Promise.all(relevantFiles.slice(0, 10).map((file) => summarizeFile(cwd, file.path)));
      const packed = packContext(summaries, 4_000);
      process.stdout.write(`${formatPackedContext(packed)}\n`);
    },
async contextFiles(query: string) {
      const config = await configStore.load();
      const projectScan = await scanProject(cwd);
      const relevantFiles = await rankRelevantFiles({
        config: config.effective,
        cwd,
        projectScan,
        prompt: query,
      });
      process.stdout.write(`${formatRelevantFileList(relevantFiles)}\n`);
    },
async contextWhy(query?: string) {
      if (query) {
        const config = await configStore.load();
        const projectScan = await scanProject(cwd);
        const relevantFiles = await rankRelevantFiles({
          config: config.effective,
          cwd,
          projectScan,
          prompt: query,
        });
        const summaries = await Promise.all(relevantFiles.slice(0, 10).map((file) => summarizeFile(cwd, file.path)));
        const packed = packContext(summaries, 4_000);
        process.stdout.write(`${formatPackedContext(packed)}\n`);
        return;
      }
      const store = new RepoBrainIndexStore(cwd);
      const index = await store.load();
      process.stdout.write(`Repo brain index: ${index.files.length} files, ${index.dependencies.length} dependency edges, updated ${index.updatedAt}\n`);
    },
async contextMap() {
      const mapManager = new RepoMapManager(cwd);
      const summary = await mapManager.getMapSummary(cwd);
      process.stdout.write(`${summary}\n`);
    },
async contextSymbols(query: string) {
      const config = await configStore.load();
      const matches = await searchProjectSymbolsDetailed({
        cwd,
        ignorePatterns: config.ignorePatterns,
        query,
      });
      process.stdout.write(`${formatDetailedSymbolMatches(matches, query)}\n`);
    },
async contextPlan(prompt: string) {
      const {buildContextPlan, explainContextPlan} = await import('../../context/contextPlan.js');
      const config = await configStore.load();
      const index = await buildProjectIndex(cwd, config.ignorePatterns);
      const plan = buildContextPlan(prompt, index.map((e) => e.path));
      process.stdout.write(`${explainContextPlan(plan)}\n`);
    },
async contextAffected(file: string) {
      const {findAffectedFiles, explainAffectedFiles} = await import('../../context/affectedFiles.js');
      const {buildImportGraph} = await import('../../context/importGraph.js');
      const {buildSymbolGraph} = await import('../../context/symbolGraph.js');
      const {buildTestSourceMap} = await import('../../context/testMapper.js');
      const config = await configStore.load();
      const index = await buildProjectIndex(cwd, config.ignorePatterns);
      const files = index.map((e) => e.path);
      const importGraph = await buildImportGraph(files, cwd);
      const symbolGraph = await buildSymbolGraph({cwd, files, importGraph}).catch(() => undefined);
      const testSourceMap = await buildTestSourceMap(files, cwd).catch(() => undefined);
      const result = findAffectedFiles([file], {importGraph, symbolGraph, testSourceMap});
      process.stdout.write(`${explainAffectedFiles(result)}\n`);
    },
async contextTests(file: string) {
      const {inferTestsForSource} = await import('../../context/testMapper.js');
      const config = await configStore.load();
      const index = await buildProjectIndex(cwd, config.ignorePatterns);
      const tests = inferTestsForSource(file, index.map((e) => e.path), cwd);
      process.stdout.write(tests.length === 0 ? 'No related tests found.\n' : `Tests for ${file}:\n${tests.map((t) => `  - ${t}`).join('\n')}\n`);
    },
async repoSummary() {
      const config = await configStore.load();
      const report = await buildRepoIntelligenceReport({
        cwd,
        ignorePatterns: config.ignorePatterns,
      });
      process.stdout.write(`${formatRepoIntelligenceReport(report)}\n`);
    },
async repoMap() {
      const mapManager = new RepoMapManager(cwd);
      const summary = await mapManager.getMapSummary(cwd);
      process.stdout.write(`${summary}\n`);
    },
async repoSymbols(query: string) {
      const config = await configStore.load();
      const matches = await searchProjectSymbolsDetailed({
        cwd,
        ignorePatterns: config.ignorePatterns,
        query,
      });
      process.stdout.write(`${formatDetailedSymbolMatches(matches, query)}\n`);
    },
async search(query: string, options: SearchCliOptions) {
      const results = await searchWorkspaceHistory({
        allSessions: options.all,
        cwd,
        limit: options.limit,
        query,
        scope: normalizeSearchScope(options.scope),
      });
      process.stdout.write(`${formatSearchResults(results, query)}\n`);
    },
async webFetch(url: string) {
      const config = await configStore.load();
      process.stdout.write(`${await invokeCliTool(cwd, config, 'web_fetch', {url})}\n`);
    },
async webSearch(query: string) {
      const config = await configStore.load();
      process.stdout.write(`${await invokeCliTool(cwd, config, 'web_search', {query})}\n`);
    },
async webResearch(query: string) {
      const config = await configStore.load();
      process.stdout.write(`${await invokeCliTool(cwd, config, 'web_research', {query})}\n`);
    },
async contextView() {
      const {buildContextViewReport, formatContextViewReport} = await import('../../context/contextViewer.js');
      const report = buildContextViewReport({
        selectedFiles: [],
        memoryItems: [],
        contextMode: 'unknown',
      });
      process.stdout.write(`${formatContextViewReport(report)}\n`);
      process.stdout.write('\nNote: Run an ApeironCode session to populate live context data.\n');
    },
async debugCompression() {
      const {explainContextCompaction, formatCompactionExplanation} = await import('../../context/compactionExplain.js');
      const explanation = explainContextCompaction(
        {items: [], tokens: 0},
        {items: [], tokens: 0},
        'no active compaction',
      );
      process.stdout.write(`${formatCompactionExplanation(explanation)}\n`);
      process.stdout.write('\nNote: Live compaction data appears here when a session compacts context.\n');
    },
});
