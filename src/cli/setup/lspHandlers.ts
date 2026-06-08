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

export const createLspHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async lspStatus(options?: {language?: string}) {
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);

      const normalizeLanguage = (value: string): string => {
        const normalized = value.trim().toLowerCase();
        const aliases: Record<string, string> = {
          go: 'Go',
          java: 'Java',
          javascript: 'JavaScript',
          js: 'JavaScript',
          py: 'Python',
          python: 'Python',
          rs: 'Rust',
          rust: 'Rust',
          ts: 'TypeScript',
          typescript: 'TypeScript',
        };

        return aliases[normalized] ?? value;
      };

      if (options?.language) {
        const result = await manager.getLanguageStatus(normalizeLanguage(options.language));
        process.stdout.write(`${manager.formatStatusReport(result)}\n`);
        return;
      }

      const report = await manager.formatAllStatusReport();
      process.stdout.write(`${report.join('\n')}\n`);
    },
async lspSessions(options?: {language?: string}) {
      const {formatSessionSnapshots} = await import('../../lsp/format.js');
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);

      process.stdout.write(formatSessionSnapshots(manager.listSessions(options?.language)));
      process.stdout.write('\n');
    },
async lspRestart(options?: {language?: string}) {
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const restarted = await manager.restartSessions(options?.language);

      process.stdout.write(`Restarted ${restarted} LSP session${restarted === 1 ? '' : 's'}.\n`);
    },
async lspStop(options?: {language?: string}) {
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const stopped = await manager.stopSessions(options?.language);

      process.stdout.write(`Stopped ${stopped} LSP session${stopped === 1 ? '' : 's'}.\n`);
    },
async lspCache() {
      const {formatCacheSnapshot} = await import('../../lsp/format.js');
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);

      process.stdout.write(formatCacheSnapshot(manager.getCacheSnapshot()));
      process.stdout.write('\n');
    },
async lspCacheClear() {
      const {LspManager} = await import('../../lsp/manager.js');
      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const before = manager.getCacheSnapshot();
      manager.clearLspCache();
      const after = manager.getCacheSnapshot();

      process.stdout.write(`Cleared LSP cache (${before.entries} -> ${after.entries} entries).\n`);
    },
async lspDiagnostics(file: string | undefined) {
      const {formatDiagnosticsResult} = await import('../../lsp/format.js');
      const {LspDiagnosticsProvider} = await import('../../lsp/diagnostics.js');
      const {LspManager} = await import('../../lsp/manager.js');

      if (!file) {
        process.stdout.write('Usage: apeironcode lsp diagnostics <file>\nShows live diagnostics from the language server for a file, or fallback analysis if the server is unavailable.\n');
        return;
      }

      const targetPath = await fileExists(file) ? file : path.resolve(cwd, file);
      if (!(await fileExists(targetPath))) {
        process.stdout.write(`File not found: ${file}\n`);
        return;
      }

      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const provider = new LspDiagnosticsProvider(manager);
      const result = await provider.getFileDiagnostics(targetPath, {cwd});

      process.stdout.write(formatDiagnosticsResult(result));
      process.stdout.write('\n');
    },
async lspDefinition(file: string | undefined, line: string | undefined, character: string | undefined) {
      const {formatDefinitionResult} = await import('../../lsp/format.js');
      const {LspDefinitionsProvider} = await import('../../lsp/definitions.js');
      const {LspManager} = await import('../../lsp/manager.js');

      if (!file || line === undefined || character === undefined) {
        process.stdout.write('Usage: apeironcode lsp definition <file> <line> <character>\nShows the definition of a symbol at the given position.\n');
        return;
      }

      const lineNum = Number.parseInt(line, 10);
      const charNum = Number.parseInt(character, 10);

      if (Number.isNaN(lineNum) || Number.isNaN(charNum)) {
        process.stdout.write('Error: line and character must be valid integers\n');
        return;
      }

      const targetPath = await fileExists(file) ? file : path.resolve(cwd, file);
      if (!(await fileExists(targetPath))) {
        process.stdout.write(`File not found: ${file}\n`);
        return;
      }

      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const provider = new LspDefinitionsProvider(manager);
      const result = await provider.getDefinition(targetPath, {line: lineNum, character: charNum}, {cwd});

      process.stdout.write(formatDefinitionResult(result));
      process.stdout.write('\n');
    },
async lspReferences(file: string | undefined, line: string | undefined, character: string | undefined) {
      const {formatReferencesResult} = await import('../../lsp/format.js');
      const {LspDefinitionsProvider} = await import('../../lsp/definitions.js');
      const {LspManager} = await import('../../lsp/manager.js');

      if (!file || line === undefined || character === undefined) {
        process.stdout.write('Usage: apeironcode lsp references <file> <line> <character>\nShows all references to a symbol at the given position.\n');
        return;
      }

      const lineNum = Number.parseInt(line, 10);
      const charNum = Number.parseInt(character, 10);

      if (Number.isNaN(lineNum) || Number.isNaN(charNum)) {
        process.stdout.write('Error: line and character must be valid integers\n');
        return;
      }

      const targetPath = await fileExists(file) ? file : path.resolve(cwd, file);
      if (!(await fileExists(targetPath))) {
        process.stdout.write(`File not found: ${file}\n`);
        return;
      }

      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const provider = new LspDefinitionsProvider(manager);
      const result = await provider.getReferences(targetPath, {line: lineNum, character: charNum}, {cwd});

      process.stdout.write(formatReferencesResult(result));
      process.stdout.write('\n');
    },
async lspSymbols(file: string) {
      const {formatSymbolQueryResult} = await import('../../lsp/format.js');
      const {LspManager} = await import('../../lsp/manager.js');
      const {LspSymbolsProvider} = await import('../../lsp/symbols.js');

      const targetPath = await fileExists(file) ? file : path.resolve(cwd, file);
      if (!(await fileExists(targetPath))) {
        process.stdout.write(`File not found: ${file}\n`);
        return;
      }

      const config = await configStore.load();
      const manager = new LspManager(config.effective.lsp);
      const provider = new LspSymbolsProvider(manager);
      const result = await provider.getFileSymbolsDetailed(targetPath, {cwd});

      process.stdout.write(formatSymbolQueryResult(result));
      process.stdout.write('\n');
    },
securityStatus() {
      process.stdout.write(`${formatSecurityLimits()}\n`);
      return Promise.resolve();
    },
async sandboxStatus() {
      process.stdout.write(`${formatSandboxStatus(await detectSandboxStatus())}\n`);
    },
async sandboxDoctor() {
      const status = await detectSandboxStatus();
      process.stdout.write(`${formatSandboxStatus(status)}\n`);
    },
async hooks() {
      process.stdout.write(`${formatHooks(await new HookRegistry(cwd).list())}\n`);
    },
async hookList() {
      process.stdout.write(`${formatHooks(await new HookRegistry(cwd).list())}\n`);
    },
async hookShow(name: string) {
      const hook = (await new HookRegistry(cwd).list()).find((candidate) => candidate.name === name);
      process.stdout.write(`${hook ? JSON.stringify(hook, null, 2) : `Hook not found: ${name}`}\n`);
    },
async hookEnable(name: string) {
      const changed = await new HookRegistry(cwd).setEnabled(name, true);
      process.stdout.write(`${changed ? 'Enabled' : 'Hook not found:'} ${name}\n`);
    },
async hookDisable(name: string) {
      const changed = await new HookRegistry(cwd).setEnabled(name, false);
      process.stdout.write(`${changed ? 'Disabled' : 'Hook not found:'} ${name}\n`);
    },
async hookTest(name: string) {
      const registry = new HookRegistry(cwd);
      const hook = (await registry.list()).find((candidate) => candidate.name === name);
      if (!hook) {
        process.stdout.write(`Hook not found: ${name}\n`);
        return;
      }
      process.stdout.write(`${formatHookRunResult(await runHook(hook, {cwd}))}\n`);
    },
async hookEvents() {
      process.stdout.write(`${formatHookEvents(await new HookEventLog(cwd).list(50))}\n`);
    },
});
