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

export const createAgentsHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
agents() {
      process.stdout.write(`${formatAgents(listAgents())}\n`);
      return Promise.resolve();
    },
agentShow(name: string) {
      const agent = getAgent(name);
      process.stdout.write(`${agent ? formatAgent(agent) : `Unknown agent: ${name}`}\n`);
      return Promise.resolve();
    },
agentRun(name: string, task: string) {
      try {
        process.stdout.write(`${formatSubagentRun(runSubagentDryRun(name, task))}\n`);
      } catch (error) {
        process.stdout.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      return Promise.resolve();
    },
teamPlan(task: string, options?: {parallelReadonly?: boolean}) {
      const plan = createTeamPlan(task);
      process.stdout.write(`${formatTeamPlan(plan)}${options?.parallelReadonly ? `\n\n${formatParallelReadonlyLanePlan(planParallelReadonlyLanes(plan))}` : ''}\n`);
      return Promise.resolve();
    },
async teamRun(task: string, options?: {dryRun?: boolean; parallelReadonly?: boolean; workspace?: string}) {
      const workspaceMode = options?.workspace === 'temp-copy' || options?.workspace === 'git-worktree' || options?.workspace === 'main'
        ? options.workspace
        : 'main';
      const plan = createTeamPlan(task);
      if (options?.dryRun) {
        process.stdout.write(`${formatTeamPlan(plan)}${options.parallelReadonly ? `\n\n${formatParallelReadonlyLanePlan(planParallelReadonlyLanes(plan))}` : ''}\n\nWorkspace mode: ${workspaceMode}\nDry run only. Use without --dry-run to execute subagents sequentially.\n`);
        return;
      }
      const config = await configStore.load();
      const result = await runTeamSequential(task, {config, cwd, workspaceMode});
      process.stdout.write(`Security note: subagents share this process environment and configured provider credentials; OS sandboxing and per-subagent credential isolation are not enabled.\n\n${formatTeamRunResult(result)}\n`);
    },
async teamWorkspaces() {
      process.stdout.write(`${formatWorkspaces(await new SubagentWorkspaceManager(cwd).listWorkspaces())}\n`);
    },
async teamRuns() {
      process.stdout.write(`${await browseTeamRuns(cwd)}\n`);
    },
async teamRunShow(teamRunId: string) {
      process.stdout.write(`${await showTeamRun(cwd, teamRunId)}\n`);
    },
async teamReview(teamRunId: string, options?: {interactive?: boolean}) {
      if (options?.interactive) {
        await (this as Pick<CliHandlers, 'teamCockpit'>).teamCockpit(teamRunId);
        return;
      }
      const artifactStore = new TeamArtifactStore(cwd);
      const workspaceManager = new SubagentWorkspaceManager(cwd);
      const [run, workspaces, mergePlans] = await Promise.all([
        artifactStore.getRun(teamRunId),
        workspaceManager.findByTeamRun(teamRunId),
        workspaceManager.createMergePlan(teamRunId),
      ]);
      process.stdout.write(`${formatTeamReview(buildTeamReviewViewModel({mergePlans, run, workspaces}))}\n`);
    },
async teamCockpit(teamRunId: string) {
      const artifactStore = new TeamArtifactStore(cwd);
      const workspaceManager = new SubagentWorkspaceManager(cwd);
      const [run, workspaces, mergePlans, memorySuggestions] = await Promise.all([
        artifactStore.getRun(teamRunId),
        workspaceManager.findByTeamRun(teamRunId),
        workspaceManager.createMergePlan(teamRunId),
        new MemorySuggestionStore(cwd).list(),
      ]);
      const relatedMemory = memorySuggestions.filter((suggestion) =>
        suggestion.relatedSessionId === teamRunId || JSON.stringify(suggestion.proposedFacts).includes(teamRunId));
      if (run) {
        await new TeamEventLog(cwd).append({
          message: 'Review cockpit opened from CLI.',
          task: run.goal || run.teamRunId,
          teamRunId,
          type: 'cockpit_opened',
        });
      }
      process.stdout.write(`${formatReviewCockpit(buildReviewCockpitViewModel({
        mergePlans,
        memorySuggestions: relatedMemory,
        run,
        state: createReviewCockpitState(),
        workspaces,
      }))}\n`);
    },
async teamArtifacts(teamRunId: string, options?: {filter?: string; search?: string}) {
      const run = await new TeamArtifactStore(cwd).getRun(teamRunId);
      process.stdout.write(`${run ? formatArtifactBrowser(run.artifacts, teamRunId, null, options) : await listTeamArtifacts(cwd, teamRunId)}\n`);
    },
async teamArtifact(teamRunId: string, artifactId: string) {
      const store = new TeamArtifactStore(cwd);
      const [run, selected] = await Promise.all([
        store.getRun(teamRunId),
        store.readArtifact(teamRunId, artifactId),
      ]);
      process.stdout.write(`${run && selected ? formatArtifactBrowser(run.artifacts, teamRunId, {artifactId: selected.artifact.id, content: selected.content}) : await showTeamArtifact(cwd, teamRunId, artifactId)}\n`);
    },
async teamExport(teamRunId: string) {
      process.stdout.write(`${await showTeamRun(cwd, teamRunId)}\n\n${await listTeamArtifacts(cwd, teamRunId)}\n`);
    },
async teamExportPatch(teamRunId: string, options?: {file?: string; includeConflicts?: boolean}) {
      process.stdout.write(`Patch export written: ${await exportTeamPatch(cwd, teamRunId, options)}\n`);
    },
async teamValidatePatch(teamRunId: string, patchPath?: string) {
      process.stdout.write(`${formatPatchValidation(await validateTeamPatch(cwd, teamRunId, patchPath))}\n`);
    },
async teamIgnored(teamRunId: string) {
      const manager = new SubagentWorkspaceManager(cwd);
      const workspaces = await manager.findByTeamRun(teamRunId);
      const diffs = await Promise.all(workspaces.map((workspace) => manager.collectDiff(workspace)));
      process.stdout.write(`${formatIgnoredFiles(diffs)}\n`);
    },
async teamMergePlan(teamRunId: string) {
      process.stdout.write(`${formatMergePlans(await new SubagentWorkspaceManager(cwd).createMergePlan(teamRunId))}\n`);
    },
async teamConflicts(teamRunId: string, options?: {file?: string; json?: boolean}) {
      const plans = await new SubagentWorkspaceManager(cwd).createMergePlan(teamRunId);
      const filtered = options?.file
        ? plans.map((plan) => ({
          ...plan,
          conflictDetails: plan.conflictDetails?.filter((conflict) => conflict.path === options.file) ?? [],
          conflicts: plan.conflicts.filter((conflictPath) => conflictPath === options.file),
        }))
        : plans;
      if (options?.json) {
        process.stdout.write(`${JSON.stringify(filtered.flatMap((plan) => plan.conflictDetails ?? []), null, 2)}\n`);
        return;
      }
      process.stdout.write(`${formatConflictReport(filtered)}\n`);
    },
async teamApply(teamRunId: string, options?: {file?: string; force?: boolean}) {
      const manager = new SubagentWorkspaceManager(cwd);
      const mergePlans = await manager.createMergePlan(teamRunId);
      const patchPath = await exportTeamPatch(cwd, teamRunId, {file: options?.file});
      const validation = await validateTeamPatch(cwd, teamRunId, patchPath);
      process.stdout.write(`${formatApprovalReview({
        action: 'Apply isolated team workspace changes',
        filesAffected: options?.file ? [options.file] : mergePlans.flatMap((plan) => plan.files.map((file) => file.path)),
        preview: `${formatMergePlans(mergePlans)}\n\n${formatPatchValidation(validation)}`,
        reason: 'This copies reviewed isolated workspace changes into the main project.',
        riskLevel: 'high',
        target: teamRunId,
      })}\n`);
      if (!validation.ok && !options?.force) {
        process.stdout.write('Patch validation failed. Apply blocked; rerun with --force only after manual review.\n');
        return;
      }
      const config = await configStore.load();
      if (config.effective.approvalMode !== 'trusted' && config.effective.approvalMode !== 'bypass') {
        process.stdout.write('Merge apply requires approvalMode trusted/bypass. Run merge-plan first and approve explicitly.\n');
        return;
      }
      const applied = await manager.apply(teamRunId, options?.file);
      await new TeamEventLog(cwd).append({
        message: `Merge applied: ${applied.join(', ') || 'no files'}`,
        task: teamRunId,
        teamRunId,
        type: 'merge_applied',
      });
      process.stdout.write(`Applied ${applied.length} file change${applied.length === 1 ? '' : 's'} from ${teamRunId}.\n${applied.join('\n')}\n`);
    },
async teamResolve(teamRunId: string, options?: {action?: string; file?: string}) {
      const manager = new SubagentWorkspaceManager(cwd);
      if (options?.file && options.action) {
        if (!['apply', 'manual', 'skip'].includes(options.action)) {
          process.stdout.write('Resolution action must be one of: apply, manual, skip\n');
          return;
        }
        const state = await setResolution(cwd, teamRunId, options.file, options.action as MergeResolutionAction);
        process.stdout.write(`${formatResolutionState(state)}\n`);
        return;
      }
      process.stdout.write(`${formatMergeResolution(teamRunId, await manager.createMergePlan(teamRunId), await loadResolutionState(cwd, teamRunId))}\n`);
    },
async teamDiscard(teamRunId: string) {
      const count = await new SubagentWorkspaceManager(cwd).discard(teamRunId);
      process.stdout.write(`Discarded ${count} workspace${count === 1 ? '' : 's'} for ${teamRunId}.\n`);
    },
async teamWorkspaceCleanup() {
      const count = await new SubagentWorkspaceManager(cwd).cleanupDiscarded();
      process.stdout.write(`Cleaned ${count} workspace record${count === 1 ? '' : 's'}.\n`);
    },
});
