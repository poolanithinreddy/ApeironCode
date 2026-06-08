/* eslint-disable @typescript-eslint/no-unused-vars */
import type {MergeResolutionAction} from '../../agents/workspace/resolution.js';
import type {ProviderFallbackSimulationKind} from '../../providers/fallbackSimulation.js';
import type {AgentMode} from '../../agent/types.js';
import type {TaskPlan} from '../../tasks/types.js';
import type {CostCliOptions, ContextRefreshCliOptions, ConfigCommandKey, ConfigSetOptions, DoctorCliOptions, HistoryCliOptions, ProviderTestCliOptions, RevertCliOptions, RootCliOptions, SearchCliOptions, SessionCliOptions} from '../args.js';
import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {redactSecretLikeContent} from '../../memory/safety.js';
import * as shared from './shared.js';

const {Agent, App, ConfigStore, GitHubClient, HookEventLog, HookRegistry, MemoryGraphStore, MemoryManager, MemorySuggestionStore, React, RepoBrainIndexStore, RepoMapManager, SessionStore, SkillStore, SubagentWorkspaceManager, TaskStore, TeamArtifactStore, TeamEventLog, WorkflowReportStore, applyRuntimeOverrides, applySetupProfile, browseTeamRuns, buildContinuationPrompt, buildLocalPrReviewReport, buildPrSummaryReport, buildProjectIndex, buildRepoBrainIndexForCli, buildRepoIntelligenceReport, buildReviewCockpitViewModel, buildSkillRunPlan, buildTeamReviewViewModel, buildTokenBudgetReport, checkOllamaStatus, createAgent, createDefaultToolRegistry, createGitHubClientForCli, createGitHubIssue, createGitHubIssueComment, createGitHubPull, createReviewCockpitState, createSkillFromDescription, createStarterSkill, createTeamPlan, detectGitHubRepo, detectSandboxStatus, evaluatePermissionRules, explainMemorySelection, exportTeamPatch, fileExists, findConfiguredMcpEndpoint, forgetSessionMemories, formatAgent, formatAgents, formatApprovalReview, formatArtifactBrowser, formatConflictReport, formatConnectorStatus, formatCost, formatCostBrowser, formatDetailedSymbolMatches, formatDoctorReport, formatEffectiveModeLabel, formatEvalList, formatEvalReport, formatFallbackChain, formatGitHubActionsRuns, formatGitHubCiExplanation, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview, formatHistoryBrowser, formatHookEvents, formatHookRunResult, formatHooks, formatIgnoredFiles, formatJson, formatMcpEndpointList, formatMcpTestResult, formatMcpToolList, formatMemoryFindings, formatMemoryGraphSummary, formatMemoryReview, formatMemoryReviewText, formatMemorySourceTrace, formatMemorySuggestionDetail, formatMemorySuggestions, formatMergePlans, formatMergeResolution, formatMissingTaskMessage, formatModelDisplayEntries, formatModelRecommendations, formatOllamaModels, formatOllamaPullHint, formatOllamaRecommendations, formatOllamaStatus, formatPackedContext, formatParallelReadonlyLanePlan, formatPatchValidation, formatPluginCatalog, formatPromptText, formatProviderCatalog, formatProviderFallbackSimulation, formatProviderSetupDetails, formatRelatedMemories, formatRelevantFileList, formatRepoIntelligenceReport, formatResolutionState, formatReviewCockpit, formatSandboxStatus, formatSearchResults, formatSecurityLimits, formatSessionSummary, formatSetupResult, formatSetupStatus, formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates, formatSubagentRun, formatTaskPlanList, formatTaskPlanSummary, formatTeamPlan, formatTeamReview, formatTeamRunResult, formatTokenBudgetReport, formatTokens, formatToolList, formatUsageSummary, formatWorkflowRecipe, formatWorkflowRecipeList, formatWorkflowReport, formatWorkspaces, getAgent, getCostScopeLabel, getGitHubIssue, getGitHubPull, getGlobalConfigPath, getHistorySessionLabel, getSetupStatus, getWorkflowRecipe, inferDependencyGraph, invokeCliTool, listAgents, listConfiguredMcpEndpoints, listConnectorStatuses, listGitHubActionsJobs, listGitHubActionsRuns, listGitHubIssues, listGitHubPullFiles, listGitHubPulls, listModelDisplayEntries, listProviderStatuses, listTeamArtifacts, listWorkflowRecipes, loadCostSessions, loadExternalTools, loadLatestEvalReport, loadMcpEndpointCatalog, loadMemoryWhyText, loadPluginCatalog, loadResolutionState, loadSelectedTask, logger, normalizeModelRole, normalizeSearchScope, packContext, parseIssueNumber, parsePermissionRules, parseProviderModelRef, path, planParallelReadonlyLanes, process, providerRegistry, pruneMemoryGraph, queryEditHistory, rankRelevantFiles, recommendModels, render, resetSetup, resolveEffectiveMode, resolveProviderChain, reviewMemoryGraph, rollbackMemoryItem, runDoctor, runEval, runHook, runInteractive, runOneShot, runProviderSmokeTest, runSubagentDryRun, runTeamSequential, runWorkflowRecipe, scanProject, searchMemoryGraph, searchProjectSymbolsDetailed, searchWorkspaceHistory, setResolution, sharedMcpServerManager, shouldApproveCliWrite, showTeamArtifact, showTeamRun, simulateProviderFallback, summarizeFile, toDisplayString, upsertMemoryFact, validateTeamPatch} = shared;

export const createMemoryHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async memoryShow(options: {global?: boolean}) {
      const memoryManager = new MemoryManager(cwd);
      if (options.global) {
        const memory = await memoryManager.loadGlobalMemory();
        process.stdout.write(memory ? JSON.stringify(memory, null, 2) : 'No global memory found\n');
      } else {
        const memory = await memoryManager.loadProjectMemory();
        process.stdout.write(memory ? JSON.stringify(memory, null, 2) : 'No project memory found\n');
      }
    },
async memoryGraph() {
      const store = new MemoryGraphStore(cwd);
      process.stdout.write(`${formatMemoryGraphSummary(await store.load())}\n`);
    },
async memoryClear(options: {global?: boolean}) {
      const memoryManager = new MemoryManager(cwd);
      if (options.global) {
        await memoryManager.saveGlobalMemory({});
        process.stdout.write('Global memory cleared\n');
      } else {
        await memoryManager.saveProjectMemory({});
        process.stdout.write('Project memory cleared\n');
      }
    },
async memoryLearn(fact: string) {
      const store = new MemoryGraphStore(cwd);
      const graph = await store.load();
      const next = await store.save(upsertMemoryFact(graph, {
        name: fact.slice(0, 80),
        observation: fact,
        source: 'user',
        tags: ['cli-learned'],
        type: 'decision',
      }));
      process.stdout.write(`${formatMemoryGraphSummary(next)}\n`);
    },
memoryEdit() {
      process.stdout.write('Memory editor feature coming soon\n');
      return Promise.resolve();
    },
async memorySummarize(options: {global?: boolean}) {
      const memoryManager = new MemoryManager(cwd);

      if (options.global) {
        const memory = await memoryManager.loadGlobalMemory();
        const summarized = memoryManager.summarizeGlobalMemory(memory);
        await memoryManager.saveGlobalMemory(summarized);
        process.stdout.write(`${JSON.stringify(summarized, null, 2)}\n`);
        return;
      }

      const memory = await memoryManager.loadProjectMemory();
      const summarized = memoryManager.summarizeProjectMemory(memory);
      await memoryManager.saveProjectMemory(summarized);
      const preview = memoryManager.formatProjectMemoryPreview(summarized);
      process.stdout.write(`${preview || 'Project memory summarized.'}\n`);
    },
async memorySearch(query: string, options: SearchCliOptions) {
      const results = await searchWorkspaceHistory({
        allSessions: options.all,
        cwd,
        limit: options.limit,
        query,
        scope: 'memory',
      });
      process.stdout.write(`${formatSearchResults(results, query)}\n`);
    },
async memoryRelated(query: string) {
      const store = new MemoryGraphStore(cwd);
      process.stdout.write(`${formatRelatedMemories(searchMemoryGraph(await store.load(), query))}\n`);
    },
async memorySuggestionShow(id: string) {
      const suggestion = (await new MemorySuggestionStore(cwd).list()).find((entry) => entry.id === id) ?? null;
      process.stdout.write(`${formatMemorySuggestionDetail(suggestion)}\n`);
    },
async memorySuggestionApprove(id?: string, options?: {all?: boolean}) {
      const store = new MemorySuggestionStore(cwd);
      if (options?.all) {
        const count = await store.applyAll();
        process.stdout.write(`Applied ${count} memory suggestion${count === 1 ? '' : 's'}.\n`);
        return;
      }
      if (!id) {
        process.stdout.write('Usage: apeironcode memory approve <id> or apeironcode memory approve --all\n');
        return;
      }
      const suggestion = await store.apply(id);
      process.stdout.write(`${suggestion ? `Applied memory suggestion ${id}` : `Memory suggestion not found: ${id}`}\n`);
    },
async memorySuggestionReject(id?: string, options?: {all?: boolean}) {
      const store = new MemorySuggestionStore(cwd);
      if (options?.all) {
        const count = await store.rejectAll();
        process.stdout.write(`Rejected ${count} memory suggestion${count === 1 ? '' : 's'}.\n`);
        return;
      }
      if (!id) {
        process.stdout.write('Usage: apeironcode memory reject <id> or apeironcode memory reject --all\n');
        return;
      }
      const suggestion = await store.reject(id);
      process.stdout.write(`${suggestion ? `Rejected memory suggestion ${id}` : `Memory suggestion not found: ${id}`}\n`);
    },
async memoryReview(options?: {confidence?: string; source?: string; status?: string; team?: string}) {
      const store = new MemoryGraphStore(cwd);
      const suggestions = await new MemorySuggestionStore(cwd).list();
      process.stdout.write(`${formatMemoryReview(reviewMemoryGraph(await store.load()))}\n\n${formatMemoryReviewText(suggestions, {...options, teamRunId: options?.team})}\n`);
    },
async memorySuggestions() {
      process.stdout.write(`${formatMemorySuggestions(await new MemorySuggestionStore(cwd).list())}\n`);
    },
async memoryPrune() {
      const store = new MemoryGraphStore(cwd);
      const before = await store.load();
      const after = await store.save(pruneMemoryGraph(before));
      process.stdout.write(`Pruned memory graph: ${before.entities.length} -> ${after.entities.length} entities, ${before.edges.length} -> ${after.edges.length} edges.\n`);
    },
async memoryWhy(query?: string) {
      const graph = await new MemoryGraphStore(cwd).load();
      const related = searchMemoryGraph(graph, query ?? cwd, 5);
      process.stdout.write(`${await loadMemoryWhyText(cwd, sessionStore)}\n\nGraph memory selection:\n${explainMemorySelection(related)}\n`);
    },
async memoryConflicts() {
      const findings = reviewMemoryGraph(await new MemoryGraphStore(cwd).load());
      process.stdout.write(`${formatMemoryFindings('Memory Conflicts', findings)}\n`);
    },
async memoryStale() {
      const findings = reviewMemoryGraph(await new MemoryGraphStore(cwd).load());
      process.stdout.write(`${formatMemoryFindings('Stale Memories', findings)}\n`);
    },
async memorySource(id: string) {
      const [graph, suggestions] = await Promise.all([
        new MemoryGraphStore(cwd).load(),
        new MemorySuggestionStore(cwd).list(),
      ]);
      process.stdout.write(`${formatMemorySourceTrace(graph, suggestions, id)}\n`);
    },
async memoryRollback(id: string, options?: {yes?: boolean}) {
      const store = new MemoryGraphStore(cwd);
      const result = rollbackMemoryItem(await store.load(), id, Boolean(options?.yes));
      if (result.changed) {
        await store.save(result.graph);
      }
      process.stdout.write(`${result.message}\n`);
    },
async memoryForgetSession(sessionId: string, options?: {yes?: boolean}) {
      const store = new MemoryGraphStore(cwd);
      const result = forgetSessionMemories(await store.load(), sessionId, Boolean(options?.yes));
      if (result.changed) {
        await store.save(result.graph);
      }
      process.stdout.write(`${result.message}\n`);
    },
async memoryExplain(query: string) {
      const graph = await new MemoryGraphStore(cwd).load();
      const related = searchMemoryGraph(graph, query, 10);
      process.stdout.write(`Memory retrieval plan for: "${query}"\n${explainMemorySelection(related)}\n`);
    },
async memoryVerify() {
      const graph = await new MemoryGraphStore(cwd).load();
      const findings = reviewMemoryGraph(graph);
      const stale = findings.filter((f) => f.type === 'stale');
      if (stale.length === 0) {
        process.stdout.write('All memory references verified (no stale entries found).\n');
        return;
      }
      process.stdout.write(`${formatMemoryFindings('Verification Issues', stale)}\n`);
    },
async memoryCompact() {
      const store = new MemoryGraphStore(cwd);
      const before = await store.load();
      const pruned = pruneMemoryGraph(before);
      await store.save(pruned);
      const removed = before.entities.length - pruned.entities.length;
      process.stdout.write(`Compacted: ${before.entities.length} → ${pruned.entities.length} entities (removed ${removed}).\n`);
    },
async memoryExport(_options?: {redacted?: boolean}) {
      const graph = await new MemoryGraphStore(cwd).load();
      const redacted = {
        ...graph,
        entities: graph.entities.map((e) => ({
          ...e,
          observations: e.observations.map((o) => redactSecretLikeContent(o)),
        })),
      };
      process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`);
    },
async memoryForget(id: string, options?: {yes?: boolean}) {
      const store = new MemoryGraphStore(cwd);
      const result = rollbackMemoryItem(await store.load(), id, Boolean(options?.yes));
      if (result.changed) {
        await store.save(result.graph);
      }
      process.stdout.write(`${result.message}\n`);
    },
});
