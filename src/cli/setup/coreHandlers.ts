/* eslint-disable @typescript-eslint/no-unused-vars */
import type {MergeResolutionAction} from '../../agents/workspace/resolution.js';
import type {ProviderFallbackSimulationKind} from '../../providers/fallbackSimulation.js';
import type {AgentMode} from '../../agent/types.js';
import type {TaskPlan} from '../../tasks/types.js';
import type {CostCliOptions, ContextRefreshCliOptions, ConfigCommandKey, ConfigSetOptions, DoctorCliOptions, HistoryCliOptions, ProviderTestCliOptions, RevertCliOptions, RootCliOptions, SearchCliOptions, SessionCliOptions} from '../args.js';
import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import type {ApeironCodeConfig} from '../../config/config.js';
import type {PluginMcpServer} from '../../plugins/types.js';
import type {McpServerConfig} from '../../mcp/serverConfig.js';
import * as shared from './shared.js';
import {buildWelcomeDashboardModel, formatCompactHome, renderWelcomeDashboard} from '../../ui/welcomeDashboard.js';
import {detectFirstRunState, shouldShowFirstRunSetup} from './firstRun.js';

const {Agent, App, ConfigStore, FileMcpTokenStore, runMcpDeviceLogin, GitHubClient, HookEventLog, HookRegistry, McpClient, McpSessionV2, MemoryGraphStore, MemoryManager, MemorySuggestionStore, React, RepoBrainIndexStore, RepoMapManager, SessionStore, SkillStore, SubagentWorkspaceManager, TaskStore, TeamArtifactStore, TeamEventLog, WorkflowReportStore, applyRuntimeOverrides, applySetupProfile, browseTeamRuns, buildContinuationPrompt, buildLocalPrReviewReport, buildPrSummaryReport, buildProjectIndex, buildRepoBrainIndexForCli, buildRepoIntelligenceReport, buildReviewCockpitViewModel, buildSkillRunPlan, buildTeamReviewViewModel, buildTokenBudgetReport, checkOllamaStatus, createAgent, createDefaultToolRegistry, createGitHubClientForCli, createGitHubIssue, createGitHubIssueComment, createGitHubPull, createReviewCockpitState, createSkillFromDescription, createStarterSkill, createTeamPlan, detectGitHubRepo, detectSandboxStatus, evaluatePermissionRules, explainMemorySelection, exportTeamPatch, fileExists, findConfiguredMcpEndpoint, forgetSessionMemories, formatAgent, formatAgents, formatApprovalReview, formatArtifactBrowser, formatConflictReport, formatConnectorStatus, formatCost, formatCostBrowser, formatDetailedSymbolMatches, formatDoctorReport, formatEffectiveModeLabel, formatEvalList, formatEvalReport, formatFallbackChain, formatGitHubActionsRuns, formatGitHubCiExplanation, formatGitHubIssue, formatGitHubIssueList, formatGitHubPullList, formatGitHubWritePreview, formatHistoryBrowser, formatHookEvents, formatHookRunResult, formatHooks, formatIgnoredFiles, formatJson, formatMcpEndpointList, formatMcpTestResult, formatMcpToolList, formatMemoryFindings, formatMemoryGraphSummary, formatMemoryReview, formatMemoryReviewText, formatMemorySourceTrace, formatMemorySuggestionDetail, formatMemorySuggestions, formatMergePlans, formatMergeResolution, formatMissingTaskMessage, formatModelDisplayEntries, formatModelRecommendations, formatOllamaModels, formatOllamaPullHint, formatOllamaRecommendations, formatOllamaStatus, formatPackedContext, formatParallelReadonlyLanePlan, formatPatchValidation, formatPluginCatalog, formatPromptText, formatProviderCatalog, formatProviderFallbackSimulation, formatProviderSetupDetails, formatRelatedMemories, formatRelevantFileList, formatRepoIntelligenceReport, formatResolutionState, formatReviewCockpit, formatSandboxStatus, formatSearchResults, formatSecurityLimits, formatSessionSummary, formatSetupResult, formatSetupStatus, formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates, formatSubagentRun, formatTaskPlanList, formatTaskPlanSummary, formatTeamPlan, formatTeamReview, formatTeamRunResult, formatTokenBudgetReport, formatTokens, formatToolList, formatUsageSummary, formatWorkflowRecipe, formatWorkflowRecipeList, formatWorkflowReport, formatWorkspaces, getAgent, getCostScopeLabel, getGitHubIssue, getGitHubPull, getGlobalConfigPath, getHistorySessionLabel, getMcpAuthStatus, getSetupStatus, getWorkflowRecipe, inferDependencyGraph, invokeCliTool, listAgents, listConfiguredMcpEndpoints, listConnectorStatuses, listGitHubActionsJobs, listGitHubActionsRuns, listGitHubIssues, listGitHubPullFiles, listGitHubPulls, listModelDisplayEntries, listProviderStatuses, listTeamArtifacts, listWorkflowRecipes, loadCostSessions, loadExternalTools, loadLatestEvalReport, loadMcpEndpointCatalog, loadMemoryWhyText, loadPluginCatalog, loadResolutionState, loadSelectedTask, logger, normalizeModelRole, normalizeSearchScope, packContext, parseIssueNumber, parsePermissionRules, parseProviderModelRef, path, planParallelReadonlyLanes, process, providerRegistry, pruneMemoryGraph, queryEditHistory, rankRelevantFiles, recommendModels, render, resetSetup, resolveEffectiveMode, resolveProviderChain, reviewMemoryGraph, rollbackMemoryItem, runDoctor, runEval, runHook, runInteractive, runOneShot, runProviderSmokeTest, runSubagentDryRun, runTeamSequential, runWorkflowRecipe, scanProject, searchMemoryGraph, searchProjectSymbolsDetailed, searchWorkspaceHistory, setResolution, sharedMcpServerManager, shouldApproveCliWrite, showTeamArtifact, showTeamRun, simulateProviderFallback, summarizeFile, summarizeMcpPermissions, toDisplayString, upsertMemoryFact, validateTeamPatch} = shared;

const toMcpSessionConfig = (
  serverName: string,
  server: PluginMcpServer,
  settings?: ApeironCodeConfig['mcp']['servers'][string],
): McpServerConfig => {
  const base = {
    allowedTools: settings?.allowedTools,
    deniedTools: settings?.deniedTools,
    enabled: settings?.enabled ?? true,
    id: serverName,
    name: serverName,
    outputTokenLimit: settings?.outputTokenLimit,
    timeoutMs: settings?.timeoutMs,
    trustLevel: settings?.trustLevel ?? 'low',
  };
  if (server.type === 'stdio') {
    return {...base, args: server.args, command: server.command, env: server.env, transport: 'stdio'};
  }
  if (server.type === 'http') {
    return {...base, headers: server.headers, transport: 'http', url: server.url};
  }
  return {...base, headers: server.headers, transport: 'sse', url: server.url};
};

export const createCoreHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async runRoot(prompt: string | undefined, options: RootCliOptions) {
      const baseConfig = await configStore.load();
      const config = applyRuntimeOverrides(baseConfig, options);
      const uiConfig = config.effective.ui ?? {
        compact: false,
        showTips: true,
        showWhatsNew: true,
        theme: 'auto' as const,
        welcome: true,
      };
      const resumeSession = options.resume ? await sessionStore.load(options.resume) : null;

      if (options.resume && !resumeSession) {
        throw new Error(`Session ${options.resume} was not found.`);
      }

      if (options.executePlan) {
        const {PlanApprovalService} = await import('../../agent/planApprovalService.js');
        const planService = new PlanApprovalService(cwd);
        const plan = await planService.loadPlan(options.executePlan);
        if (!plan) {
          process.stdout.write(`Plan ${options.executePlan} not found.\n`);
          return;
        }
        if (plan.status !== 'approved') {
          process.stdout.write(`Plan ${options.executePlan} has status "${plan.status}" but must be "approved" to execute.\n`);
          return;
        }
        await runOneShot(cwd, plan.goal, config, resumeSession, plan.mode, {planId: options.executePlan});
        return;
      }

      if (prompt) {
        await runOneShot(cwd, prompt, config, resumeSession, options.mode, {
          planOnly: options.planOnly,
          planId: undefined,
        });
        return;
      }

      const shouldRenderWelcome = options.welcome === true
        || (uiConfig.welcome && process.env.CI !== '1' && process.stdout.isTTY === true);
      if (shouldRenderWelcome) {
        const tasks = await taskStore.list();
        const firstRunState = detectFirstRunState({
          defaultProvider: config.effective.defaultProvider,
          defaultModel: config.effective.defaultModel,
        });
        const showWizardHint = shouldShowFirstRunSetup(firstRunState);

        if (options.welcome === true) {
          // Explicit --welcome flag: show full dashboard
          process.stdout.write(`${renderWelcomeDashboard(buildWelcomeDashboardModel({
            accountStatus: config.effective.localOnly ? 'local-only' : 'local-first',
            activeTasks: tasks.filter((task: TaskPlan) => task.status === 'running').length,
            brainStatus: 'ready when .apeironcode exists',
            bridgeStatus: 'local bridge optional',
            cwd,
            model: config.effective.defaultModel,
            permissionMode: config.effective.approvalMode,
            provider: config.effective.defaultProvider,
            showTips: uiConfig.showTips,
            showWhatsNew: uiConfig.showWhatsNew,
            taskCount: tasks.length,
            username: process.env.USER,
            version: '0.1.0',
          }), {
            colorMode: uiConfig.theme,
            width: process.stdout.columns,
          })}\n\n`);
        } else {
          // Default: show compact home
          process.stdout.write(`${formatCompactHome({
            version: '0.1.0',
            workspacePath: cwd,
            provider: config.effective.defaultProvider,
            model: config.effective.defaultModel,
            mode: options.mode ?? 'chat',
          })}\n\n`);
          if (showWizardHint) {
            process.stdout.write(`  Tip: Run \`apeironcode setup\` to configure a provider.\n\n`);
          }
        }
      }
      await runInteractive(cwd, config, resumeSession, options.mode);
    },
async doctor(options: DoctorCliOptions) {
      const config = await configStore.load();
      if (options.report) {
        const {formatSystemReportMarkdown, generateSystemReport} = await import('../../diagnostics/report.js');
        process.stdout.write(`${formatSystemReportMarkdown(await generateSystemReport({config, cwd, providerRegistry}))}\n`);
        return;
      }
      const report = await runDoctor({
        config,
        cwd,
        fix: Boolean(options.fix),
        providerRegistry,
        strictProviderConnectivity: Boolean(options.strict),
        testProviderConnectivity: Boolean(options.providerCheck),
      });
      process.stdout.write(`${formatDoctorReport(report)}\n`);
      if (options.providerCheck && options.strict) {
        const providerCheck = report.checks.find((check) => check.label === 'Provider connectivity');
        if (providerCheck?.status !== 'pass') {
          process.exitCode = 1;
        }
      }
    },
async debugTraces(options?: {last?: number}) {
      const {formatTraceSummary, getRecentSpans} = await import('../../utils/trace.js');
      process.stdout.write(`${formatTraceSummary(getRecentSpans(options?.last ?? 10))}\n`);
    },
async debugLogs(options?: {last?: number}) {
      const {readRecentLogLines} = await import('../../utils/structuredLogger.js');
      const lines = await readRecentLogLines(undefined, options?.last ?? 50);
      process.stdout.write(`${lines.length > 0 ? lines.join('\n') : 'No structured logs found.'}\n`);
    },
async debugTokens() {
      const {formatTokenBreakdown, createEmptyTokenBreakdown} = await import('../../tokens/estimate.js');
      process.stdout.write(`${formatTokenBreakdown(createEmptyTokenBreakdown())}\n`);
    },
async debugConfig() {
      const {redactLogValue} = await import('../../utils/structuredLogger.js');
      const config = await configStore.load();
      process.stdout.write(`${JSON.stringify(redactLogValue(config.effective), null, 2)}\n`);
    },
async setup(options?: {local?: boolean; provider?: string}) {
      const {formatProviderList} = await import('./providerWizard.js');
      process.stdout.write(`${formatProviderList(process.env)}\n\n`);
      process.stdout.write(`${formatSetupResult(await applySetupProfile(configStore, options))}\n`);
    },
async setupStatus() {
      process.stdout.write(`${formatSetupStatus(await getSetupStatus(configStore))}\n`);
    },
async setupReset(options?: {dryRun?: boolean}) {
      const result = await resetSetup(configStore, options);
      process.stdout.write([
        result.dryRun ? 'Setup reset dry run' : 'Setup reset',
        `Config: ${result.configPath}`,
        result.dryRun
          ? 'No files removed.'
          : result.deleted ? 'User setup config removed.' : 'No user setup config found.',
      ].join('\n') + '\n');
    },
async listTools() {
      const config = await configStore.load();
      const toolRegistry = createDefaultToolRegistry();
      await loadExternalTools(toolRegistry, config.effective, cwd);
      const output = formatToolList(toolRegistry.list());
      process.stdout.write(`${output}\n`);
    },
async listPlugins() {
      const {endpoints, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      process.stdout.write(`${formatPluginCatalog(plugins)}\n`);
      process.stdout.write(`\nMCP Endpoints: ${endpoints.length}\n`);
    },
async listMcp() {
      const {endpoints} = await loadMcpEndpointCatalog(configStore, cwd);
      process.stdout.write(`${formatMcpEndpointList(endpoints)}\n`);
    },
async listMcpTools(serverName: string, options?: {all?: boolean}) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      if (options?.all) {
        const rows: Array<{name: string; requiresApproval?: boolean; riskLevel?: string; server: string; transport: string}> = [];
        for (const endpoint of listConfiguredMcpEndpoints({config: config.effective, plugins})) {
          const session = new McpSessionV2(toMcpSessionConfig(endpoint.server.name, endpoint.server, config.effective.mcp.servers[endpoint.server.name]), {cwd});
          try {
            await session.start();
            rows.push(...session.getToolDefinitions().map((tool) => ({
              name: tool.name,
              requiresApproval: Boolean(tool.requiresApproval),
              riskLevel: tool.riskLevel,
              server: endpoint.server.name,
              transport: endpoint.server.type,
            })));
          } catch {
            rows.push({name: '(unavailable)', server: endpoint.server.name, transport: endpoint.server.type});
          } finally {
            await session.stop();
          }
        }
        formatJson(rows);
        return;
      }
      const endpoint = findConfiguredMcpEndpoint({
        config: config.effective,
        plugins,
        serverName,
      });

      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }

      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        formatJson(session.getToolDefinitions().map((tool) => ({
          description: tool.description,
          name: tool.name,
          requiresApproval: tool.requiresApproval,
          riskLevel: tool.riskLevel,
        })));
      } finally {
        await session.stop();
      }
    },
async mcpSearch(query: string) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const lower = query.toLowerCase();
      const results: Array<{description: string; name: string; riskLevel?: string; server: string; trustLevel: string}> = [];
      for (const endpoint of listConfiguredMcpEndpoints({config: config.effective, plugins})) {
        const serverConfig = toMcpSessionConfig(endpoint.server.name, endpoint.server, config.effective.mcp.servers[endpoint.server.name]);
        const session = new McpSessionV2(serverConfig, {cwd});
        try {
          await session.start();
          for (const tool of session.getToolDefinitions()) {
            if (tool.name.toLowerCase().includes(lower) || tool.description.toLowerCase().includes(lower)) {
              results.push({
                description: tool.description,
                name: tool.name,
                riskLevel: tool.riskLevel,
                server: endpoint.server.name,
                trustLevel: serverConfig.trustLevel,
              });
            }
          }
        } finally {
          await session.stop();
        }
      }
      formatJson(results);
    },
async testMcp(serverName: string) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({
        config: config.effective,
        plugins,
        serverName,
      });

      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }

      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        const healthy = await session.client.ping();
        formatJson({connected: healthy, server: serverName, toolCount: session.getToolDefinitions().length, transport: endpoint.server.type});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatJson({connected: false, error: message, server: serverName, transport: endpoint.server.type});
      } finally {
        await session.stop();
      }
    },
async mcpAddStdio(id: string, options: {args?: string[]; command: string}) {
      const current = await configStore.readUserConfig();
      const next = await configStore.patchUserConfig({
        mcp: {servers: {...current.mcp.servers, [id]: {args: options.args ?? [], command: options.command, enabled: true, env: {}, trustLevel: 'low', type: 'stdio'}}},
      });
      formatJson(next.mcp.servers[id]);
    },
async mcpAddHttp(id: string, options: {url: string}) {
      const current = await configStore.readUserConfig();
      const next = await configStore.patchUserConfig({
        mcp: {servers: {...current.mcp.servers, [id]: {enabled: true, headers: {}, trustLevel: 'low', type: 'http', url: options.url}}},
      });
      formatJson(next.mcp.servers[id]);
    },
async mcpAddSse(id: string, options: {url: string}) {
      const current = await configStore.readUserConfig();
      const next = await configStore.patchUserConfig({
        mcp: {servers: {...current.mcp.servers, [id]: {enabled: true, headers: {}, trustLevel: 'low', type: 'sse', url: options.url}}},
      });
      formatJson(next.mcp.servers[id]);
    },
async mcpRemove(serverName: string) {
      const current = await configStore.readUserConfig();
      const {[serverName]: _removed, ...servers} = current.mcp.servers;
      const next = await configStore.writeUserConfig({...current, mcp: {servers}});
      formatJson(next.mcp.servers);
    },
async mcpEnable(serverName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      if (!server) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const next = await configStore.patchUserConfig({mcp: {servers: {[serverName]: {...server, enabled: true}}}});
      formatJson(next.mcp.servers[serverName]);
    },
async mcpDisable(serverName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      if (!server) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const next = await configStore.patchUserConfig({mcp: {servers: {[serverName]: {...server, enabled: false}}}});
      formatJson(next.mcp.servers[serverName]);
    },
async mcpCall(serverName: string, toolName: string, options: {json?: string}) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({config: config.effective, plugins, serverName});
      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const input = JSON.parse(options.json ?? '{}') as Record<string, unknown>;
      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        formatJson(await session.client.callTool(toolName, input));
      } finally {
        await session.stop();
      }
    },
async mcpResources(serverName: string) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({config: config.effective, plugins, serverName});
      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        formatJson(await session.client.listResources());
      } finally {
        await session.stop();
      }
    },
async mcpRead(serverName: string, uri: string, options?: {addToContext?: boolean}) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({config: config.effective, plugins, serverName});
      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        const resource = await session.client.readResource(uri);
        formatJson(options?.addToContext ? {addedToContext: true, resource} : resource);
      } finally {
        await session.stop();
      }
    },
async mcpPrompts(serverName: string) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({config: config.effective, plugins, serverName});
      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        formatJson(await session.client.listPrompts());
      } finally {
        await session.stop();
      }
    },
async mcpPrompt(serverName: string, promptName: string, options?: {preview?: boolean}) {
      const {config, plugins} = await loadMcpEndpointCatalog(configStore, cwd);
      const endpoint = findConfiguredMcpEndpoint({config: config.effective, plugins, serverName});
      if (!endpoint) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const session = new McpSessionV2(toMcpSessionConfig(serverName, endpoint.server, config.effective.mcp.servers[serverName]), {cwd});
      try {
        await session.start();
        const prompt = await session.client.getPrompt(promptName);
        formatJson({injected: options?.preview ? false : true, preview: Boolean(options?.preview), prompt});
      } finally {
        await session.stop();
      }
    },
async mcpPermissions(serverName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      if (!server) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      process.stdout.write(`${summarizeMcpPermissions({
        enabled: server.enabled ?? true,
        id: serverName,
        name: serverName,
        transport: server.type,
        trustLevel: server.trustLevel ?? 'low',
        allowedTools: server.allowedTools,
        deniedTools: server.deniedTools,
      })}\n`);
    },
async mcpAllow(serverName: string, toolName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      if (!server) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const allowedTools = Array.from(new Set([...(server.allowedTools ?? []), toolName]));
      const deniedTools = (server.deniedTools ?? []).filter((candidate) => candidate !== toolName);
      const next = await configStore.patchUserConfig({mcp: {servers: {[serverName]: {...server, allowedTools, deniedTools}}}});
      formatJson(next.mcp.servers[serverName]);
    },
async mcpDeny(serverName: string, toolName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      if (!server) {
        process.stdout.write(`Unknown MCP server: ${serverName}\n`);
        return;
      }
      const deniedTools = Array.from(new Set([...(server.deniedTools ?? []), toolName]));
      const next = await configStore.patchUserConfig({mcp: {servers: {[serverName]: {...server, deniedTools}}}});
      formatJson(next.mcp.servers[serverName]);
    },
async mcpAuthStatus(serverName: string) {
      const token = await new FileMcpTokenStore().get(serverName);
      formatJson({server: serverName, status: getMcpAuthStatus(token)});
    },
async mcpAuthLogout(serverName: string) {
      await new FileMcpTokenStore().clear(serverName);
      formatJson({server: serverName, status: 'missing'});
    },
async mcpAuthLogin(serverName: string) {
      const current = await configStore.readUserConfig();
      const server = current.mcp.servers[serverName];
      const resourceUrl = (server as {url?: string} | undefined)?.url
        ?? (server as {endpoint?: string} | undefined)?.endpoint;
      if (!resourceUrl) {
        process.stdout.write(`MCP OAuth login for ${serverName} requires a configured HTTP/SSE URL.\n`);
        return;
      }
      try {
        const token = await runMcpDeviceLogin({
          onUserPrompt: (info: {userCode: string; verificationUri: string}) => {
            process.stdout.write(`Authorize ApeironCode at ${info.verificationUri} with code ${info.userCode}\n`);
          },
          resourceUrl,
          serverId: serverName,
        });
        formatJson({server: serverName, status: 'authenticated', tokenStored: Boolean(token.accessToken)});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`MCP OAuth login failed: ${message}\n`);
      }
    },
async addPermission(rule: string) {
      const current = await configStore.readUserConfig();
      const permissions = Array.from(new Set([...current.permissions, rule]));
      const next = await configStore.patchUserConfig({permissions});
      formatJson(next.permissions);
    },
async removePermission(rule: string) {
      const current = await configStore.readUserConfig();
      const permissions = current.permissions.filter((candidate) => candidate !== rule);
      const next = await configStore.patchUserConfig({permissions});
      formatJson(next.permissions);
    },
async listPermissions() {
      const value = await configStore.readUserConfig();
      formatJson(value.permissions);
    },
async checkPermission(resource: string) {
      const config = await configStore.load();
      const rules = parsePermissionRules([
        ...(config.user.permissions || []),
        ...(config.project.permissions || []),
      ]).valid;

      // Try to parse as a rule format (e.g., "Bash(npm test)" or "Tool(plugin:echo.echo)")
      const ruleMatch = resource.match(/^(\w+)\((.+)\)$/u);
      if (!ruleMatch || !ruleMatch[1] || !ruleMatch[2]) {
        process.stdout.write(`Invalid resource format. Expected: ActionType(resource)\n`);
        process.stdout.write(`Examples: Bash(npm test), FileRead(.env), Tool(plugin:echo.echo)\n`);
        return;
      }

      const actionTypeStr = ruleMatch[1];
      const resourcePath = ruleMatch[2];

      const validActionTypes = ['FileRead', 'FileEdit', 'FileWrite', 'Bash', 'Tool', 'Network'];
      if (!validActionTypes.includes(actionTypeStr)) {
        process.stdout.write(`Unknown action type: ${actionTypeStr}\n`);
        return;
      }

      const {decision, matchedRule} = evaluatePermissionRules(rules, {
        actionType: actionTypeStr as 'FileRead' | 'FileEdit' | 'FileWrite' | 'Bash' | 'Tool' | 'Network',
        resource: resourcePath,
      });

      process.stdout.write(`\nPermission Check Result:\n`);
      process.stdout.write(`  Resource: ${resource}\n`);
      process.stdout.write(`  Decision: ${decision.toUpperCase()}\n`);
      if (matchedRule) {
        process.stdout.write(`  Matched Rule: ${matchedRule.raw}\n`);
        const globalPerms = config.user.permissions || [];
        process.stdout.write(`  Source: ${globalPerms.includes(matchedRule.raw) ? 'global' : 'project'}\n`);
      }
      process.stdout.write('\n');
    },
async getConfigValue(key: ConfigCommandKey, options: ConfigSetOptions) {
      const value = await configStore.getValue(key, options.provider);
      formatJson(value);
    },
async setConfigValue(key: ConfigCommandKey, value: string, options: ConfigSetOptions) {
      const nextConfig = await configStore.setUserValue(key, value, options.provider);
      formatJson(nextConfig);
    },
async listConfig() {
      const value = await configStore.readUserConfig();
      formatJson(value);
    },
});
