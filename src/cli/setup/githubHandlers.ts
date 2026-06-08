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

export const createGithubHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async githubStatus() {
      const statuses = await listConnectorStatuses(cwd);
      process.stdout.write(`${statuses.map(formatConnectorStatus).join('\n\n')}\n`);
    },
async githubIssues() {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${formatGitHubIssueList(await listGitHubIssues(client))}\n`);
    },
async githubIssue(number: string) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${formatGitHubIssue(await getGitHubIssue(client, parseIssueNumber(number)))}\n`);
    },
async githubIssueComment(number: string, text: string, options?: {dryRun?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable approval-gated GitHub writes; the token will not be printed.\n');
        return;
      }
      const issueNumber = parseIssueNumber(number);
      const preview = formatGitHubWritePreview({body: text, target: `issue #${issueNumber}`, type: 'issue-comment'});
      process.stdout.write(`${preview}\n`);
      const config = await configStore.load();
      if (options?.dryRun || !shouldApproveCliWrite(config)) {
        process.stdout.write('Not posted. Re-run with approvalMode trusted/bypass or --dry-run for preview-only automation.\n');
        return;
      }
      const result = await createGitHubIssueComment(client, issueNumber, text);
      process.stdout.write(`Posted GitHub issue comment: ${result.htmlUrl ?? result.id}\n`);
    },
async githubIssueCreate(options?: {body?: string; dryRun?: boolean; title?: string}) {
      const title = options?.title?.trim();
      if (!title) {
        process.stdout.write('Usage: apeironcode github issue create --title "..." --body "..."\n');
        return;
      }
      const preview = formatGitHubWritePreview({
        body: [`Title: ${title}`, '', options?.body ?? ''].join('\n'),
        target: 'new issue',
        type: 'issue-create',
      });
      if (options?.dryRun) {
        process.stdout.write(`${preview}\nNot posted. Dry run only; no GitHub token or remote is required for this preview.\n`);
        return;
      }
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable approval-gated GitHub writes; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${preview}\n`);
      const config = await configStore.load();
      if (!shouldApproveCliWrite(config)) {
        process.stdout.write('Not posted. Re-run with approvalMode trusted/bypass or --dry-run for preview-only automation.\n');
        return;
      }
      const result = await createGitHubIssue(client, {body: options?.body, title});
      process.stdout.write(`Created GitHub issue #${result.number}: ${result.htmlUrl ?? ''}\n`);
    },
async githubPrs() {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${formatGitHubPullList(await listGitHubPulls(client))}\n`);
    },
async githubPr(number: string) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${formatGitHubIssue(await getGitHubPull(client, parseIssueNumber(number)))}\n`);
    },
async githubPrSummary(number: string) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      const prNumber = parseIssueNumber(number);
      const [pull, files] = await Promise.all([
        getGitHubPull(client, prNumber),
        listGitHubPullFiles(client, prNumber),
      ]);
      process.stdout.write(`${buildPrSummaryReport(pull, files)}\n`);
    },
async githubPrReview(number: string, options?: {dryRun?: boolean; post?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub API reads; the token will not be printed.\n');
        return;
      }
      const prNumber = parseIssueNumber(number);
      const [pull, files] = await Promise.all([
        getGitHubPull(client, prNumber),
        listGitHubPullFiles(client, prNumber),
      ]);
      const report = buildLocalPrReviewReport(pull, buildPrSummaryReport(pull, files));
      process.stdout.write(`${report}\n`);
      if (!options?.post) {
        process.stdout.write(options?.dryRun ? 'Not posted. Dry run only.\n' : 'Not posted. Add --post to request approval-gated posting.\n');
        return;
      }
      const preview = formatGitHubWritePreview({body: report, target: `PR #${prNumber}`, type: 'pr-comment'});
      process.stdout.write(`${preview}\n`);
      const config = await configStore.load();
      if (!shouldApproveCliWrite(config)) {
        process.stdout.write('Not posted. Re-run with approvalMode trusted/bypass to allow approval-gated GitHub writes.\n');
        return;
      }
      const result = await createGitHubIssueComment(client, prNumber, report);
      process.stdout.write(`Posted GitHub PR review comment: ${result.htmlUrl ?? result.id}\n`);
    },
async githubPrCreate(options?: {base?: string; body?: string; dryRun?: boolean; head?: string; title?: string}) {
      const title = options?.title?.trim();
      const base = options?.base?.trim();
      const head = options?.head?.trim();
      if (!title || !base || !head) {
        process.stdout.write('Usage: apeironcode github pr create --title "..." --body "..." --base main --head branch\n');
        return;
      }
      const preview = formatGitHubWritePreview({
        body: [`Title: ${title}`, `Branches: ${head} -> ${base}`, '', options?.body ?? ''].join('\n'),
        target: 'new pull request',
        type: 'pr-create',
      });
      if (options?.dryRun) {
        process.stdout.write(`${preview}\nNot posted. Dry run only; no GitHub token or remote is required for this preview.\n`);
        return;
      }
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable approval-gated GitHub writes; the token will not be printed.\n');
        return;
      }
      process.stdout.write(`${preview}\n`);
      const config = await configStore.load();
      if (!shouldApproveCliWrite(config)) {
        process.stdout.write('Not posted. Re-run with approvalMode trusted/bypass or --dry-run for preview-only automation.\n');
        return;
      }
      const result = await createGitHubPull(client, {base, body: options?.body, head, title});
      process.stdout.write(`Created GitHub PR #${result.number}: ${result.htmlUrl ?? ''}\n`);
    },
async githubRepo() {
      const repo = await detectGitHubRepo(cwd);
      process.stdout.write(`${repo ? `${repo.owner}/${repo.name}\n${repo.remoteUrl}` : 'No GitHub remote detected.'}\n`);
    },
async githubActions(runId?: string) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub Actions reads; the token will not be printed.\n');
        return;
      }
      if (runId) {
        process.stdout.write(`${formatGitHubCiExplanation(await listGitHubActionsJobs(client, Number.parseInt(runId, 10)), runId)}\n`);
        return;
      }
      process.stdout.write(`${formatGitHubActionsRuns(await listGitHubActionsRuns(client))}\n`);
    },
async githubCiExplain(runId?: string) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable GitHub Actions reads; the token will not be printed.\n');
        return;
      }
      const targetRunId = runId ?? String((await listGitHubActionsRuns(client)).find((run) => run.conclusion === 'failure')?.id ?? '');
      if (!targetRunId) {
        process.stdout.write('No failed GitHub Actions run found in the latest runs.\n');
        return;
      }
      process.stdout.write(`${formatGitHubCiExplanation(await listGitHubActionsJobs(client, Number.parseInt(targetRunId, 10)), targetRunId)}\n`);
    },
async githubPrComment(number: string, text: string, options?: {dryRun?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      if (!client.configured) {
        process.stdout.write('GITHUB_TOKEN is not set. Set it to enable approval-gated GitHub writes; the token will not be printed.\n');
        return;
      }
      const prNumber = parseIssueNumber(number);
      const preview = formatGitHubWritePreview({body: text, target: `PR #${prNumber}`, type: 'pr-comment'});
      process.stdout.write(`${preview}\n`);
      const config = await configStore.load();
      if (options?.dryRun || !shouldApproveCliWrite(config)) {
        process.stdout.write('Not posted. Re-run with approvalMode trusted/bypass or --dry-run for preview-only automation.\n');
        return;
      }
      const result = await createGitHubIssueComment(client, prNumber, text);
      process.stdout.write(`Posted GitHub PR comment: ${result.htmlUrl ?? result.id}\n`);
    },
async githubParseCommand(comment: string) {
      await Promise.resolve();
      const mention = shared.resolveMentionFromComment(comment);
      formatJson(mention ?? {known: false, command: null});
    },
async githubAutomateIssue(target: string, options?: {dryRun?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      const result = await shared.runIssueToPrAutomation({
        client,
        config: shared.loadAutomationPermissionsFromEnv(),
        issueNumber: parseIssueNumber(target),
        options: {dryRun: options?.dryRun !== false},
      });
      process.stdout.write(`${shared.buildAutomationSummary(result)}\n`);
    },
async githubAutomatePrReview(target: string, options?: {dryRun?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      const result = await shared.runPrReviewAutomation({
        client,
        config: shared.loadAutomationPermissionsFromEnv(),
        options: {dryRun: options?.dryRun !== false},
        prNumber: parseIssueNumber(target),
      });
      process.stdout.write(`${shared.buildAutomationSummary(result)}\n`);
    },
async githubAutomateFixCi(target: string, options?: {dryRun?: boolean}) {
      const client = await createGitHubClientForCli(cwd);
      if (!client) {
        process.stdout.write('No GitHub remote detected.\n');
        return;
      }
      const maybeNumber = /^#?\d+$/u.test(target) || /\/pull\/\d+/u.test(target);
      const result = await shared.runCiFixAutomation({
        client,
        config: shared.loadAutomationPermissionsFromEnv(),
        options: {dryRun: options?.dryRun !== false},
        ...(maybeNumber ? {prNumber: parseIssueNumber(target)} : {ref: target}),
      });
      process.stdout.write(`${shared.buildAutomationSummary(result)}\n`);
    },
async githubActionSimulate(eventJson: string) {
      const event = shared.parseRawActionEvent('issue_comment', eventJson);
      const result = await shared.runActionFromEvent({
        config: shared.loadActionConfigFromEnv({...process.env, INPUT_DRY_RUN: 'true'}),
        cwd,
        event,
      });
      process.stdout.write(`${shared.buildAutomationSummary(result)}\n`);
    },
});
