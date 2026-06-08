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

export const createProvidersHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async providerList() {
      const config = await configStore.load();
      process.stdout.write(`${formatProviderCatalog()}\n`);
    },
async providerSetup(providerName?: string) {
      const config = await configStore.load();
      const targetProvider = providerName ?? config.effective.defaultProvider;
      process.stdout.write(`${formatProviderSetupDetails(targetProvider, config.effective)}\n`);
    },
async modelList(role?: string) {
      const config = await configStore.load();
      const normalizedRole = normalizeModelRole(role);
      process.stdout.write(`${formatModelDisplayEntries(listModelDisplayEntries(config.effective, providerRegistry, normalizedRole))}\n`);
    },
async modelRecommend(role?: string) {
      const config = await configStore.load();
      const normalizedRole = normalizeModelRole(role) ?? 'coding';
      process.stdout.write(`${formatModelRecommendations(recommendModels(config.effective, providerRegistry, normalizedRole), normalizedRole, config.effective, providerRegistry)}\n`);
    },
async ollamaStatus() {
      const config = await configStore.load();
      process.stdout.write(`${formatOllamaStatus(await checkOllamaStatus(config.effective))}\n`);
    },
async ollamaModels() {
      const config = await configStore.load();
      process.stdout.write(`${formatOllamaModels(await checkOllamaStatus(config.effective))}\n`);
    },
async ollamaRecommend() {
      const config = await configStore.load();
      const status = await checkOllamaStatus(config.effective);
      process.stdout.write(`${formatOllamaRecommendations(status)}\n`);
    },
ollamaPullHint(model: string) {
      process.stdout.write(`${formatOllamaPullHint(model)}\n`);
      return Promise.resolve();
    },
async providerFallback(role?: string) {
      const config = await configStore.load();
      process.stdout.write(`${formatFallbackChain(resolveProviderChain(normalizeModelRole(role) ?? 'coding', config.effective))}\n`);
    },
async providerFallbackTest(role?: string) {
      const config = await configStore.load();
      const normalizedRole = normalizeModelRole(role) ?? 'coding';
      const plan = resolveProviderChain(normalizedRole, config.effective);
      process.stdout.write(`${formatFallbackChain(plan)}\n`);
      process.stdout.write(`\nRuntime behavior: ${plan.autoFallback ? 'will retry the selected fallback after classified provider failures' : 'will stop and suggest configuring fallbackModel'}.\n`);
    },
async providerFallbackSimulate(kind: string, role?: string) {
      const validKinds = new Set(['invalid-response', 'malformed-tool-call', 'missing-key', 'rate-limit', 'timeout']);
      if (!validKinds.has(kind)) {
        process.stdout.write('Usage: apeironcode provider fallback simulate missing-key|rate-limit|timeout|invalid-response|malformed-tool-call [role]\n');
        return;
      }
      const config = await configStore.load();
      process.stdout.write(`${formatProviderFallbackSimulation(simulateProviderFallback(
        config.effective,
        kind as ProviderFallbackSimulationKind,
        normalizeModelRole(role) ?? 'coding',
      ))}\n`);
    },
async providerFallbackSet(role: string, chain: string) {
      const normalizedRole = normalizeModelRole(role);
      if (!normalizedRole) {
        process.stdout.write(`Unknown fallback role: ${role}\n`);
        return;
      }

      const refs = chain.split(',').map((entry) => parseProviderModelRef(entry)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      if (refs.length === 0) {
        process.stdout.write('No valid provider:model entries found.\n');
        return;
      }

      const current = await configStore.readUserConfig();
      const primary = refs[0];
      const fallback = refs[1];
      if (!primary) {
        process.stdout.write('No valid primary provider:model entry found.\n');
        return;
      }
      const next = await configStore.patchUserConfig({
        fallbackModel: fallback ? `${fallback.provider}:${fallback.model}` : current.fallbackModel,
        models: {
          ...current.models,
          [normalizedRole]: `${primary.provider}:${primary.model}`,
        },
      });
      process.stdout.write(`Set ${normalizedRole} model to ${next.models[normalizedRole]}`);
      if (fallback) {
        process.stdout.write(` and fallbackModel to ${next.fallbackModel}`);
      }
      process.stdout.write('\n');
    },
async providerTest(options: ProviderTestCliOptions) {
      const config = await configStore.load();
      const result = await runProviderSmokeTest({
        config,
        modelOverride: options.model,
        providerBaseUrlOverride: options.baseUrl,
        providerOverride: options.provider,
        providerRegistry,
        strictProviderConnectivity: Boolean(options.strict),
      });
      const label = result.status === 'pass'
        ? 'PASS'
        : result.status === 'warn'
          ? 'WARN'
          : result.status === 'skip'
            ? 'SKIP'
            : 'FAIL';
      const testedProvider = options.provider ?? config.effective.defaultProvider;
      const testedModel = options.model ?? config.effective.defaultModel;
      process.stdout.write(`Provider: ${testedProvider}\nModel: ${testedModel}\nStatus: ${label}\nConfidence: ${result.confidence}\n`);
      if (result.latencyMs !== undefined) {
        process.stdout.write(`Latency: ${result.latencyMs}ms\n`);
      }
      process.stdout.write(`Detail: ${result.detail}\n`);
      if (result.fix) {
        process.stdout.write(`Fix: ${result.fix}\n`);
      }
      if (options.strict && result.status !== 'pass') {
        process.exitCode = 1;
      }
    },
async providerDoctor(options: ProviderTestCliOptions) {
      const config = await configStore.load();
      const targetProvider = options.provider ?? config.effective.defaultProvider;
      const targetModel = options.model ?? config.effective.defaultModel;
      const status = listProviderStatuses(config.effective, providerRegistry)
        .find((entry) => entry.name === targetProvider);
      const smoke = await runProviderSmokeTest({
        config,
        modelOverride: options.model,
        providerBaseUrlOverride: options.baseUrl,
        providerOverride: options.provider,
        providerRegistry,
        strictProviderConnectivity: Boolean(options.strict),
      });
      const lines = [
        `Provider: ${targetProvider}/${targetModel}`,
        status ? `Readiness: ${status.configured ? 'configured' : 'needs-setup'} | ${status.local ? 'local' : 'cloud'}` : null,
        `Smoke: ${smoke.status}/${smoke.confidence}${smoke.latencyMs !== undefined ? ` | latency=${smoke.latencyMs}ms` : ''} - ${smoke.detail}`,
        smoke.fix ? `Fix: ${smoke.fix}` : null,
      ].filter(Boolean);
      process.stdout.write(`${lines.join('\n')}\n`);
      if (options.strict && smoke.status !== 'pass') {
        process.exitCode = 1;
      }
    },
async providerEnv(providerName?: string) {
      const {validateProviderEnv: validate} = await import('../../providers/envValidation.js');
      const config = await configStore.load();
      const targetProvider = providerName ?? config.effective.defaultProvider;
      const validation = validate(targetProvider);

      const lines = [
        `Provider: ${targetProvider}`,
      ];

      if (validation.present.length > 0) {
        lines.push(`Environment (present): ${validation.present.join(', ')}`);
      }

      if (validation.missing.length > 0) {
        lines.push(`Environment (missing): ${validation.missing.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        lines.push(`Warnings: ${validation.warnings.join('; ')}`);
      }

      if (validation.present.length === 0 && validation.missing.length === 0) {
        lines.push('Environment: (no requirements)');
      }

      process.stdout.write(`${lines.join('\n')}\n`);
    },
});
