/* eslint-disable @typescript-eslint/no-unused-vars */
import type {MergeResolutionAction} from '../../agents/workspace/resolution.js';
import type {ProviderFallbackSimulationKind} from '../../providers/fallbackSimulation.js';
import type {AgentMode} from '../../agent/types.js';
import type {TaskPlan} from '../../tasks/types.js';
import type {CostCliOptions, ContextRefreshCliOptions, ConfigCommandKey, ConfigSetOptions, DoctorCliOptions, HistoryCliOptions, ProviderTestCliOptions, RevertCliOptions, RootCliOptions, SearchCliOptions, SessionCliOptions} from '../args.js';
import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import * as shared from './shared.js';

const {Agent, App, ConfigStore, GitHubClient, HookEventLog, HookRegistry, MemoryGraphStore, MemoryManager, MemorySuggestionStore, React, RepoBrainIndexStore, RepoMapManager, SessionStore, SkillStore, SubagentWorkspaceManager, TaskStore, TeamArtifactStore, TeamEventLog, WorkflowReportStore, applyRuntimeOverrides, applySetupProfile, browseTeamRuns, buildContinuationPrompt, buildLocalPrReviewReport, buildPrSummaryReport, buildProjectIndex, buildRepoBrainIndexForCli, buildRepoIntelligenceReport, buildReviewCockpitViewModel, buildSkillRunPlan, buildTeamReviewViewModel, buildTokenBudgetReport, checkOllamaStatus, createAgent, createDefaultToolRegistry, createGitHubClientForCli, createGitHubIssue, createGitHubIssueComment, createGitHubPull, createReviewCockpitState, createSkillFromDescription, createStarterSkill, createTeamPlan, detectGitHubRepo, detectSandboxStatus, evaluatePermissionRules, explainMemorySelection, exportTeamPatch, fileExists, findConfiguredMcpEndpoint, forgetSessionMemories, formatAgent, formatAgents, formatApprovalReview, formatArtifactBrowser, formatConflictReport, formatConnectorStatus, formatCost, formatCostBrowser, formatDetailedSymbolMatches, formatDoctorReport, formatEffectiveModeLabel, formatEvalList, formatEvalReport, formatFallbackChain, formatGitHubActionsRuns, formatGitHubCiExplanation, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview, formatHistoryBrowser, formatHookEvents, formatHookRunResult, formatHooks, formatIgnoredFiles, formatJson, formatMcpEndpointList, formatMcpTestResult, formatMcpToolList, formatMemoryFindings, formatMemoryGraphSummary, formatMemoryReview, formatMemoryReviewText, formatMemorySourceTrace, formatMemorySuggestionDetail, formatMemorySuggestions, formatMergePlans, formatMergeResolution, formatMissingTaskMessage, formatModelDisplayEntries, formatModelRecommendations, formatOllamaModels, formatOllamaPullHint, formatOllamaRecommendations, formatOllamaStatus, formatPackedContext, formatParallelReadonlyLanePlan, formatPatchValidation, formatPluginCatalog, formatPromptText, formatProviderCatalog, formatProviderFallbackSimulation, formatProviderSetupDetails, formatRelatedMemories, formatRelevantFileList, formatRepoIntelligenceReport, formatResolutionState, formatReviewCockpit, formatSandboxStatus, formatSearchResults, formatSecurityLimits, formatSessionSummary, formatSetupResult, formatSetupStatus, formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates, formatSubagentRun, formatTaskPlanList, formatTaskPlanSummary, formatTeamPlan, formatTeamReview, formatTeamRunResult, formatTokenBudgetReport, formatTokens, formatToolList, formatUsageSummary, formatWorkflowRecipe, formatWorkflowRecipeList, formatWorkflowReport, formatWorkspaces, getAgent, getCostScopeLabel, getGitHubIssue, getGitHubPull, getGlobalConfigPath, getHistorySessionLabel, getSetupStatus, getWorkflowRecipe, inferDependencyGraph, invokeCliTool, listAgents, listConfiguredMcpEndpoints, listConnectorStatuses, listGitHubActionsJobs, listGitHubActionsRuns, listGitHubIssues, listGitHubPullFiles, listGitHubPulls, listModelDisplayEntries, listProviderStatuses, listTeamArtifacts, listWorkflowRecipes, loadCostSessions, loadExternalTools, loadLastEvalResult, loadMcpEndpointCatalog, loadMemoryWhyText, loadPluginCatalog, loadResolutionState, loadSelectedTask, logger, normalizeModelRole, normalizeSearchScope, packContext, parseIssueNumber, parsePermissionRules, parseProviderModelRef, path, planParallelReadonlyLanes, process, providerRegistry, pruneMemoryGraph, queryEditHistory, rankRelevantFiles, recommendModels, render, resetSetup, resolveEffectiveMode, resolveProviderChain, reviewMemoryGraph, rollbackMemoryItem, runAllSuites, runDoctor, runSuiteById, runHook, runInteractive, runOneShot, runProviderSmokeTest, runSubagentDryRun, runTeamSequential, runWorkflowRecipe, scanProject, searchMemoryGraph, searchProjectSymbolsDetailed, searchWorkspaceHistory, setResolution, sharedMcpServerManager, shouldApproveCliWrite, showTeamArtifact, showTeamRun, simulateProviderFallback, summarizeFile, toDisplayString, upsertMemoryFact, validateConnectorEnv, validateTeamPatch} = shared;

export const createSkillsHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async skills() {
      process.stdout.write(`${formatSkillBrowser(await new SkillStore(cwd).list())}\n`);
    },
async skillList() {
      process.stdout.write(`${formatSkillList(await new SkillStore(cwd).list())}\n`);
    },
async skillShow(name: string) {
      const skill = await new SkillStore(cwd).load(name);
      process.stdout.write(`${skill ? formatSkillDetail(skill) : `Skill not found: ${name}`}\n`);
    },
async skillRun(name: string, options?: {input?: string; noRun?: boolean}) {
      const skill = await new SkillStore(cwd).load(name);
      if (!skill) {
        process.stdout.write(`Skill not found: ${name}\n`);
        return;
      }
      const runPlan = buildSkillRunPlan(skill, options?.input);
      if (options?.noRun) {
        process.stdout.write(`${formatSkillRunPlan(runPlan)}\n`);
        return;
      }
      const config = await configStore.load();
      const toolRegistry = createDefaultToolRegistry();
      toolRegistry.setAllowedTools(Array.from(new Set([
        ...skill.metadata.allowedTools,
        'package_info',
        'project_tree',
      ])));
      const agent = createAgent(cwd, config, null, toolRegistry);
      const result = await agent.run({
        allowModeInference: false,
        mode: 'feature',
        model: skill.metadata.modelPreference ?? config.effective.defaultModel,
        prompt: runPlan.prompt,
        providerName: config.effective.defaultProvider,
        skillName: skill.metadata.name,
      });
      process.stdout.write(`${result.finalMessage.content.trim()}\n`);
    },
async skillCreate(name: string) {
      const store = new SkillStore(cwd);
      const skill = await store.save(...(() => {
        const generated = createStarterSkill(name);
        return [generated.metadata, generated.markdown] as const;
      })());
      process.stdout.write(`Created skill: ${skill.metadata.name}\n${skill.directory}\n`);
    },
async skillGenerate(description: string) {
      const generated = createSkillFromDescription(description);
      const skill = await new SkillStore(cwd).save(generated.metadata, generated.markdown);
      process.stdout.write(`Generated skill: ${skill.metadata.name}\n${skill.directory}\n`);
    },
skillTemplates() {
      process.stdout.write(`${formatSkillTemplates()}\n`);
      return Promise.resolve();
    },
async skillTrust(name: string) {
      const skill = await new SkillStore(cwd).updateTags(name, (tags) => [...tags.filter((tag) => tag !== 'untrusted'), 'trusted']);
      process.stdout.write(`${skill ? `Trusted skill ${name}.` : `Skill not found: ${name}`}\n`);
    },
async skillEnable(name: string) {
      const skill = await new SkillStore(cwd).updateTags(name, (tags) => tags.filter((tag) => tag !== 'disabled'));
      process.stdout.write(`${skill ? `Enabled skill ${name}.` : `Skill not found: ${name}`}\n`);
    },
async skillDisable(name: string) {
      const skill = await new SkillStore(cwd).updateTags(name, (tags) => [...tags.filter((tag) => tag !== 'trusted'), 'disabled']);
      process.stdout.write(`${skill ? `Disabled skill ${name}.` : `Skill not found: ${name}`}\n`);
    },
async skillDelete(name: string) {
      const deleted = await new SkillStore(cwd).delete(name);
      process.stdout.write(`${deleted ? 'Deleted' : 'No skill found for'} ${name}\n`);
    },
async skillExport(name: string) {
      const skill = await new SkillStore(cwd).load(name);
      process.stdout.write(`${skill ? `${JSON.stringify(skill.metadata, null, 2)}\n\n${skill.markdown}` : `Skill not found: ${name}`}\n`);
    },
skillImport(filePath: string) {
      process.stdout.write(`Skill import is intentionally conservative in this build. Place skill.json and skill.md under .apeironcode-agent/skills/<name>/, then run apeironcode skill validate <name>. Requested: ${filePath}\n`);
      return Promise.resolve();
    },
async skillBrowser(options?: {filter?: string; search?: string}) {
      process.stdout.write(`${formatSkillBrowser(await new SkillStore(cwd).list(), options)}\n`);
    },
async skillValidate(name: string) {
      const skill = await new SkillStore(cwd).load(name);
      process.stdout.write(`${skill ? `Skill ${name} is valid.` : `Skill ${name} is invalid or missing.`}\n`);
    },
workflowList() {
      process.stdout.write(`${formatWorkflowRecipeList(listWorkflowRecipes())}\n`);
      return Promise.resolve();
    },
workflowShow(name: string) {
      const recipe = getWorkflowRecipe(name);
      process.stdout.write(`${recipe ? formatWorkflowRecipe(recipe) : `Unknown workflow: ${name}`}\n`);
      return Promise.resolve();
    },
async workflowRun(name: string, options?: {dryRun?: boolean; task?: string}) {
      const workflowTask = options?.task?.trim() || name.replace(/-/gu, ' ');
      const config = await configStore.load();
      const report = await runWorkflowRecipe({
        config,
        cwd,
        dryRun: options?.dryRun,
        recipeId: name,
        task: workflowTask,
      });
      process.stdout.write(`${formatWorkflowReport(report)}\n`);
    },
async workflowReport(runId: string) {
      process.stdout.write(`${formatWorkflowReport(await new WorkflowReportStore(cwd).get(runId))}\n`);
    },
evalList() {
      process.stdout.write(`${formatEvalList()}\n`);
      return Promise.resolve();
    },
async evalRun(name: string | undefined, options?: {all?: boolean}) {
      if (options?.all) {
        const summaries = await runAllSuites();
        process.stdout.write(`${summaries.map(formatEvalReport).join('\n\n')}\n`);
        return;
      }
      if (!name) {
        process.stdout.write('Missing eval suite. Run: apeironcode eval list\n');
        return;
      }
      process.stdout.write(`${formatEvalReport(await runSuiteById(name))}\n`);
    },
async evalReport(suite = 'smoke') {
      process.stdout.write(`${formatEvalReport(await loadLastEvalResult(suite))}\n`);
    },
async connectorList() {
      const statuses = await listConnectorStatuses(cwd);
      process.stdout.write([
        'Connectors',
        ...statuses.map((status) => `- ${status.name}: ${status.configured ? 'configured' : 'missing'} - ${status.detail}`),
      ].join('\n') + '\n');
    },
connectorEnv(connector: string) {
      if (!['github', 'linear', 'jira', 'slack'].includes(connector)) {
        process.stdout.write(`Unknown connector: ${connector}\n`);
        return Promise.resolve();
      }
      const validation = validateConnectorEnv(connector as 'github' | 'linear' | 'jira' | 'slack');
      process.stdout.write([
        `Connector env: ${validation.connectorId}`,
        `Status: ${validation.configured ? 'configured' : 'missing'}`,
        ...validation.requirements.map((requirement) => {
          const alternatives = requirement.alternatives?.length ? ` or ${requirement.alternatives.join(' or ')}` : '';
          return `- ${requirement.name}${alternatives}: ${requirement.configured ? 'configured' : 'missing'}`;
        }),
        validation.setupHint,
      ].join('\n') + '\n');
      return Promise.resolve();
    },
});
