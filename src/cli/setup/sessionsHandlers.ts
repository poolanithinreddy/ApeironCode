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

export const createSessionsHandlers = ({cwd, configStore, sessionStore, taskStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
async deleteSession(sessionId: string) {
      const deleted = await sessionStore.delete(sessionId);
      process.stdout.write(`${deleted ? 'Deleted' : 'No session found for'} ${sessionId}\n`);
    },
async continueTask(taskId?: string) {
      const task = await loadSelectedTask(taskStore, taskId, 'latest-incomplete');
      if (!task) {
        process.stdout.write(`${formatMissingTaskMessage(taskId, true)}\n`);
        return;
      }

      if (task.status === 'completed') {
        process.stdout.write(`Task ${task.id} is already completed. Use \`apeironcode plan show ${task.id}\` to inspect it.\n`);
        return;
      }

      const config = await configStore.load();
      const taskToRun = task.status === 'running' ? task : (await taskStore.setStatus(task.id, 'running')) ?? task;
      const session = taskToRun.linkedSessionId ? await sessionStore.load(taskToRun.linkedSessionId) : null;
      const agent = createAgent(cwd, config, session);
      agent.currentSession.taskPlanId = taskToRun.id;
      const result = await agent.run({
        model: config.effective.defaultModel,
        mode: taskToRun.mode,
        prompt: buildContinuationPrompt(taskToRun),
        providerName: config.effective.defaultProvider,
      });
      const refreshedTask = await taskStore.load(taskToRun.id) ?? taskToRun;
      process.stdout.write(`${formatTaskPlanSummary(refreshedTask)}\n\n${result.finalMessage.content.trim()}\n`);
    },
async cost(options: CostCliOptions) {
      const sessions = await loadCostSessions(sessionStore, cwd, options);
      if (options.session && sessions.length === 0) {
        process.stdout.write(`No session found for ${options.session}.\n`);
        return;
      }

      if (!options.all && !options.project && !options.session) {
        process.stdout.write(`${formatUsageSummary(sessions[0]?.tokenUsage)}\n`);
        return;
      }

      process.stdout.write(`${formatCostBrowser(getCostScopeLabel(options), sessions)}\n`);
    },
async history(options: HistoryCliOptions) {
      const limit = options.limit && options.limit > 0 ? options.limit : 10;
      const sessions = await sessionStore.select({
        all: options.all,
        projectPath: cwd,
        sessionId: options.session,
      });
      const edits = await queryEditHistory(cwd, {
        filePath: options.file,
        limit,
        sessionId: options.session,
      });

      process.stdout.write(`${formatHistoryBrowser({
        costLabel: options.session ? `session ${options.session}` : options.all ? 'all saved sessions' : 'this project',
        editLabel: options.file ? `file ${options.file}` : options.session ? `session ${options.session}` : 'this project',
        edits,
        includeProjectPath: Boolean(options.all),
        sessionLabel: getHistorySessionLabel(options),
        sessions: sessions.slice(0, limit),
      })}\n`);
    },
async listSessions(options: SessionCliOptions) {
      const sessions = await sessionStore.list(options.all ? undefined : cwd);
      process.stdout.write(
        `${sessions.length > 0 ? sessions.map((session) => formatSessionSummary(session)).join('\n') : 'No sessions found.'}\n`,
      );
    },
async resumeSession(sessionId: string) {
      const session = await sessionStore.load(sessionId);
      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        return;
      }

      const config = await configStore.load();
      await runInteractive(cwd, config, session);
    },
async revert(target?: string, options?: RevertCliOptions) {
      const config = await configStore.load();
      const agent = createAgent(cwd, config);
      const input = options?.file
        ? {path: options.file}
        : target && target !== 'last'
          ? {editId: target}
          : {target: 'last' as const};
      const result = await agent.invokeTool('revert_patch', input);
      process.stdout.write(`${result.summary}\n`);
      if (result.diff) {
        process.stdout.write(`${result.diff}\n`);
      }
    },
async sessions(options?: {all?: boolean}) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatSessionsList} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(options?.all ? '/' : cwd);
      const sessions = await manager.listSessions();

      process.stdout.write(`${formatSessionsList(sessions)}\n`);
    },
async sessionList(options?: {all?: boolean}) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatSessionsList} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(options?.all ? '/' : cwd);
      const sessions = await manager.listSessions();

      process.stdout.write(`${formatSessionsList(sessions)}\n`);
    },
async sessionStart(goal: string, options?: {mode?: AgentMode; provider?: string; model?: string; run?: boolean; background?: boolean}) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {BackgroundSessionRunner} = await import('../../multisession/background/index.js');
      const {ProcessManager} = await import('../../multisession/background/processManager.js');
      const {formatSessionSnapshot, formatSessionDetail} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.createSession({
        goal,
        mode: options?.mode,
        model: options?.model,
        provider: options?.provider,
      });

      // Handle background flag (Phase 8: enable real background worker)
      if (options?.background) {
        const runner = new BackgroundSessionRunner(cwd);
        const processManager = new ProcessManager(cwd);

        try {
          // Spawn worker process
          const workerInfo = processManager.spawnWorker(session.id);

          if (!workerInfo) {
            process.stdout.write(`Failed to spawn background worker. Session queued locally.\n`);
            process.stdout.write(`Quick links:\n  apeironcode session show ${session.id.slice(0, 8)}\n  apeironcode session logs ${session.id.slice(0, 8)} --follow\n`);
            return;
          }

          // Store worker metadata
          await manager.storeWorkerMetadata(session.id, workerInfo.pid, workerInfo.command);

          // Log worker spawned event
          await runner.logSessionEvent(session.id, 'worker_started', `Background worker spawned with PID ${workerInfo.pid}`);

          // Provide user feedback
          process.stdout.write(`Started background session: ${session.id.slice(0, 8)}\n`);
          process.stdout.write(`Goal: ${goal}\n`);
          process.stdout.write(`Worker PID: ${workerInfo.pid}\n\n`);
          process.stdout.write(`Watch:\n  apeironcode session logs ${session.id.slice(0, 8)} --follow\n\n`);
          process.stdout.write(`Attach:\n  apeironcode session attach ${session.id.slice(0, 8)}\n\n`);
          process.stdout.write(`Stop:\n  apeironcode session stop ${session.id.slice(0, 8)}\n`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          process.stdout.write(`Failed to start background session: ${errorMsg}\n`);
          process.exitCode = 1;
        }
        return;
      }

      const shouldRun = options?.run !== false; // Default to running
      if (!shouldRun) {
        const snapshot = await manager.getSnapshot(session.id);
        if (snapshot) {
          process.stdout.write(`Created agent session:\n\n${formatSessionSnapshot(snapshot)}\n\nRun with: apeironcode session resume ${session.id.slice(0, 8)}\n`);
        }
        return;
      }

      // Run the agent with this session
      process.stdout.write(`Starting agent session: ${session.id.slice(0, 8)}\n`);
      const config = await configStore.load();
      const agent = createAgent(cwd, config);
      try {
        const result = await agent.run({
          agentSessionId: session.id,
          mode: options?.mode,
          model: options?.model,
          prompt: goal,
          providerName: options?.provider,
        });

        const updated = await manager.getSession(session.id);
        if (updated) {
          process.stdout.write(`\n${formatSessionDetail(updated)}\n`);
        }
        process.stdout.write(`\n${result.finalMessage.content}\n`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stdout.write(`Session failed: ${errorMsg}\n`);
        process.exitCode = 1;
      }
    },
async sessionShow(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatSessionDetail} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        return;
      }

      process.stdout.write(`${formatSessionDetail(session)}\n`);
    },
async sessionAttach(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {BackgroundSessionRunner, formatRecentEventsForAttach} = await import('../../multisession/background/index.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        return;
      }

      let output = `# Session: ${session.goal}\n`;
      output += `**Status**: ${session.status}\n`;
      output += `**Mode**: ${session.mode ?? 'chat'}\n`;
      output += `**Model**: ${session.model ?? 'default'}\n`;
      output += `**Provider**: ${session.provider ?? 'default'}\n`;

      if (session.workerPid) {
        output += `**Worker PID**: ${session.workerPid}\n`;
      }

      output += '\n';

      if (session.startedAt) {
        const startTime = new Date(session.startedAt);
        const endTime = session.completedAt ? new Date(session.completedAt) : new Date();
        const durationSec = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        output += `**Duration**: ${durationSec}s\n\n`;
      }

      try {
        const runner = new BackgroundSessionRunner(cwd);
        const events = await runner.getTailEvents(sessionId, 20);
        output += formatRecentEventsForAttach(events, 20);
      } catch {
        output += 'No event history available yet.';
      }

      if (session.status === 'running') {
        output += '\n\n*Note: Live interactive input is not supported. This is a read-only event stream.*';
        output += `\nUse 'apeironcode session logs ${sessionId.slice(0, 8)} --follow' to watch new events.`;
      }

      process.stdout.write(`${output}\n`);
    },
async sessionLogs(sessionId: string, options?: {tail?: number; follow?: boolean}) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {BackgroundSessionRunner, formatEventLog} = await import('../../multisession/background/index.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        process.exitCode = 1;
        return;
      }

      const runner = new BackgroundSessionRunner(cwd);
      const tailCount = options?.tail ?? 50;

      if (options?.follow) {
        // Stream events with follow enabled
        process.stdout.write(`Following events for session ${sessionId.slice(0, 8)}...\n`);
        try {
          const eventStream = runner.streamEvents(sessionId, {tail: tailCount, follow: true});
          for await (const event of eventStream) {
            const {formatEvent} = await import('../../multisession/background/format.js');
            process.stdout.write(`${formatEvent(event)}\n`);
          }
        } catch (error) {
          process.stdout.write(`Error streaming events: ${error instanceof Error ? error.message : String(error)}\n`);
          process.exitCode = 1;
        }
      } else {
        // Print tail events
        try {
          const events = await runner.getTailEvents(sessionId, tailCount);
          process.stdout.write(`# Event Log: ${session.goal}\n\n${formatEventLog(events)}\n`);
        } catch (error) {
          process.stdout.write(`Failed to read event log: ${error instanceof Error ? error.message : String(error)}\n`);
          process.exitCode = 1;
        }
      }
    },
async sessionPause(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.pauseSession(sessionId);

      if (session) {
        process.stdout.write(`Paused session ${sessionId.slice(0, 8)}\n`);
      } else {
        process.stdout.write(`No session found for ${sessionId}\n`);
      }
    },
async sessionResume(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatSessionDetail} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        return;
      }

      if (session.status === 'completed' || session.status === 'failed' || session.status === 'stopped') {
        process.stdout.write(`Session ${sessionId.slice(0, 8)} is ${session.status}. View with: apeironcode session show ${sessionId.slice(0, 8)}\n`);
        return;
      }

      if (session.status === 'running') {
        process.stdout.write(`Session ${sessionId.slice(0, 8)} is already running.\n`);
        return;
      }

      // Resume paused or queued session by running agent
      process.stdout.write(`Resuming session: ${sessionId.slice(0, 8)}\n`);
      const config = await configStore.load();
      const agent = createAgent(cwd, config);
      try {
        const result = await agent.run({
          agentSessionId: sessionId,
          mode: session.mode,
          model: session.model,
          prompt: session.goal,
          providerName: session.provider,
        });

        const updated = await manager.getSession(sessionId);
        if (updated) {
          process.stdout.write(`\n${formatSessionDetail(updated)}\n`);
        }
        process.stdout.write(`\n${result.finalMessage.content}\n`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stdout.write(`Session failed: ${errorMsg}\n`);
        process.exitCode = 1;
      }
    },
async sessionRunWorker(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {BackgroundSessionRunner} = await import('../../multisession/background/index.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stderr.write(`Worker error: No session found for ${sessionId}\n`);
        process.exitCode = 1;
        return;
      }

      const runner = new BackgroundSessionRunner(cwd);

      try {
        // Log worker start
        await runner.logSessionEvent(sessionId, 'worker_started', 'Background worker process started');

        // Mark session as running if it's queued
        if (session.status === 'queued') {
          await manager.startSession(sessionId);
        }

        // Log session started
        await runner.logSessionEvent(sessionId, 'session_started', 'Agent session execution started');

        // Run the agent with this session
        const config = await configStore.load();
        const agent = createAgent(cwd, config);

        await agent.run({
          agentSessionId: sessionId,
          mode: session.mode,
          model: session.model,
          prompt: session.goal,
          providerName: session.provider,
        });

        // Mark session as completed
        await manager.completeSession(sessionId);
        await runner.logSessionEvent(sessionId, 'session_completed', 'Agent session completed successfully');

        // Release locks
        await manager.releaseSessionLocks(sessionId);
        await runner.logSessionEvent(sessionId, 'lock_released', 'All session locks released');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Worker error: ${errorMsg}\n`);

        // Mark session as failed
        await manager.failSession(sessionId, errorMsg);
        await runner.logSessionEvent(sessionId, 'session_failed', `Session failed: ${errorMsg}`);

        // Release locks on failure
        await manager.releaseSessionLocks(sessionId);
        await runner.logSessionEvent(sessionId, 'lock_released', 'All session locks released due to failure');

        process.exitCode = 1;
      }
    },
async sessionStop(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {BackgroundSessionRunner} = await import('../../multisession/background/index.js');
      const {ProcessManager} = await import('../../multisession/background/processManager.js');

      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);

      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        process.exitCode = 1;
        return;
      }

      const previousStatus = session.status;
      const runner = new BackgroundSessionRunner(cwd);
      const processManager = new ProcessManager(cwd);

      // If session has a worker process, try to stop it
      if (session.workerPid && session.status === 'running') {
        if (processManager.isProcessRunning(session.workerPid)) {
          processManager.stopProcess(session.workerPid);
          await runner.logSessionEvent(sessionId, 'status_changed', `Worker process (PID ${session.workerPid}) stopped gracefully`);
        }
      }

      // Stop the session
      const stopped = await runner.stopSession(sessionId);

      if (!stopped) {
        process.stdout.write(`Failed to stop session ${sessionId.slice(0, 8)}\n`);
        process.exitCode = 1;
        return;
      }

      // Get updated session to show new status
      const updated = await manager.getSession(sessionId);

      let output = `Session stopped: ${sessionId.slice(0, 8)}\n`;
      output += `Previous status: ${previousStatus}\n`;
      output += `Current status: ${updated?.status ?? 'unknown'}\n`;

      // Show worker info if it exists
      if (session.workerPid) {
        output += `Worker PID: ${session.workerPid}\n`;
      }

      // Show lock cleanup results
      if (session.filesLocked && session.filesLocked.length > 0) {
        const locksReleased = await manager.releaseSessionLocks(sessionId);
        output += `Locks released: ${locksReleased}\n`;
      }

      if (session.filesChanged && session.filesChanged.length > 0) {
        output += `Files changed: ${session.filesChanged.length}\n`;
      }

      if (session.commandsRun && session.commandsRun.length > 0) {
        output += `Commands run: ${session.commandsRun.length}\n`;
      }

      process.stdout.write(`${output}\n`);
    },
async sessionDelete(sessionId: string) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');

      const manager = new MultiAgentSessionManager(cwd);
      const deleted = await manager.deleteSession(sessionId);

      if (deleted) {
        process.stdout.write(`Deleted session ${sessionId.slice(0, 8)}\n`);
      } else {
        process.stdout.write(`No session found for ${sessionId}\n`);
      }
    },
async sessionExport(sessionId: string, options?: {format?: 'html' | 'json' | 'markdown'; output?: string}) {
      const fs = await import('node:fs/promises');
      const pathModule = await import('node:path');
      const {SessionExporter} = await import('../../share/exporter.js');
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const manager = new MultiAgentSessionManager(cwd);
      const session = await manager.getSession(sessionId);
      if (!session) {
        process.stdout.write(`No session found for ${sessionId}\n`);
        return;
      }
      const result = await new SessionExporter(cwd).exportSession(session, {format: options?.format});
      if (options?.output) {
        await fs.mkdir(pathModule.dirname(options.output), {recursive: true});
        await fs.copyFile(result.filePath, options.output);
        process.stdout.write(`Session exported to: ${options.output}\n`);
        return;
      }
      process.stdout.write(`Session exported to: ${result.fileUrl}\n`);
    },
async sessionLocks() {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatFileLocks} = await import('../../multisession/format.js');

      const manager = new MultiAgentSessionManager(cwd);
      const locks = await manager.listFileLocks();

      process.stdout.write(`${formatFileLocks(locks)}\n`);
    },
async sessionUnlock(file: string, options?: {all?: boolean}) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');

      const manager = new MultiAgentSessionManager(cwd);

      if (options?.all) {
        await manager.cleanupStaleLocks();
        const locks = await manager.listFileLocks();
        process.stdout.write(`Cleaned up stale locks (${locks.length} remain)\n`);
      } else {
        const lock = await manager.checkFileLock(file);
        if (lock) {
          process.stdout.write(`File is locked by session ${lock.sessionId.slice(0, 8)}: ${lock.goal}\nRun: apeironcode session stop ${lock.sessionId.slice(0, 8)}\n`);
        } else {
          process.stdout.write(`File is not locked\n`);
        }
      }
    },
async share(sessionIdOrLatest: string, options?: {format?: 'json' | 'markdown' | 'html'}) {
      const {exportLatestSession, SessionExporter} = await import('../../share/exporter.js');
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');

      if (sessionIdOrLatest === 'latest') {
        const result = await exportLatestSession(cwd, {format: options?.format});
        if (!result) {
          process.stdout.write(`No sessions found to export\n`);
          return;
        }
        process.stdout.write(`Session exported to: ${result.fileUrl}\n`);
      } else {
        const manager = new MultiAgentSessionManager(cwd);
        const session = await manager.getSession(sessionIdOrLatest);
        if (!session) {
          process.stdout.write(`No session found for ${sessionIdOrLatest}\n`);
          return;
        }
        const exporter = new SessionExporter(cwd);
        const result = await exporter.exportSession(session, {format: options?.format});
        process.stdout.write(`Session exported to: ${result.fileUrl}\n`);
      }
    },
});
