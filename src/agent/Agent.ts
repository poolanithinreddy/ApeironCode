import crypto from 'node:crypto';
import type {ResolvedConfig} from '../config/config.js';
import {createTaskState} from '../core/agent/state.js';
import {EventBus} from '../core/events/bus.js';
import {TranscriptRecorder} from '../core/events/recorder.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ProviderRegistry} from '../providers/registry.js';
import {resolveProviderRouting, RoutedProvider} from '../providers/router.js';
import type {ApprovalHandler} from '../safety/approvals.js';
import {SessionStore} from '../sessions/store.js';
import {TaskTracker, createTaskPlan, shouldPersistTask} from '../tasks/taskPlanner.js';
import {TaskStore} from '../tasks/taskStore.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolResult} from '../tools/types.js';
import {toError} from '../utils/errors.js';
import {getSessionTranscriptPath} from '../utils/paths.js';
import {startSpan} from '../utils/trace.js';
import {buildProjectContext} from './context.js';
import {formatEffectiveModeLabel, resolveEffectiveMode} from './effectiveMode.js';
import {bindAgentCallbacks} from './eventBridge.js';
import {buildConciseFinalSummary, buildStandardizedFinalSummary, isVerboseOutputEnabled, shouldAppendStandardizedSummary} from './finalSummary.js';
import {runAgentLoop} from './loop.js';
import {tryRouteShortCircuit} from './agentRouter.js';
import {completeMultiAgentSessionIfNeeded, failMultiAgentSessionIfNeeded, startMultiAgentSessionIfNeeded} from './multiAgentLifecycle.js';
import {handlePlanningGate} from './planningLifecycle.js';
import {preparePromptInputs} from './promptPreparation.js';
import {detectSimpleAction} from './simpleActionRouter.js';
import {resolvePendingInstruction} from './pendingInstruction.js';
import {isPureChatIntent} from './intentClassifier.js';
import {createSession, deriveSessionTitle, type ConversationSession} from './session.js';
import {MemoryManager} from './memoryManager.js';
import {canSuggestMemorySave, maybePersistProjectMemory, persistRunMemoryGraph} from './runMemory.js';
import {clearConversationSession, compactConversationSession, loadConversationSession, mergeUsageBreakdown} from './sessionLifecycle.js';
import {configureToolExecutor, createApprovalManager, createToolOutputEmitter, loadConfiguredExternalTools} from './runContext.js';
import {runManagedTestFixLoop} from './testFixRuntime.js';
import type {AgentCallbacks, AgentMode, AgentRunOptions, ChatMessage, ToolCallRecord} from './types.js';
import {invokeAgentTool} from './toolInvocation.js';
import {resolveAgentWorkflow} from './workflows/index.js';
import {triggerBrainAutoSyncAfterRun} from './agentBrainSync.js';
interface AgentDependencies {
  config: ResolvedConfig;
  cwd: string;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistry;
  approvalHandler?: ApprovalHandler;
  sessionStore?: SessionStore;
}
export class Agent {
  private readonly sessionStore: SessionStore;
  private readonly session: ConversationSession;
  private externalToolsFingerprint?: string;
  private currentEventBus?: EventBus;
  constructor(private dependencies: AgentDependencies) {
    this.sessionStore = dependencies.sessionStore ?? new SessionStore();
    this.session = createSession(dependencies.cwd, dependencies.config.effective.defaultProvider, dependencies.config.effective.defaultModel);
  }
  get messages(): ChatMessage[] {
    return this.session.messages;
  }
  get toolCalls(): ToolCallRecord[] {
    return this.session.toolCalls;
  }
  get sessionId(): string {
    return this.session.id;
  }
  get currentSession(): ConversationSession {
    return this.session;
  }
  get mode(): AgentMode {
    return this.session.mode;
  }
  get eventBus(): EventBus | undefined {
    return this.currentEventBus;
  }
  setConfig(config: ResolvedConfig): void {
    this.dependencies.config = config;
    this.externalToolsFingerprint = undefined;
  }
  setMode(mode: AgentMode): void {
    this.session.mode = mode;
    this.session.updatedAt = new Date().toISOString();
  }
  clearConversation(): void {
    clearConversationSession(this.session);
  }
  loadSession(session: ConversationSession): void {
    loadConversationSession(this.session, session);
  }
  compactConversation(): string {
    return compactConversationSession(this.session);
  }
  private async ensureExternalToolsLoaded(): Promise<void> {
    this.externalToolsFingerprint = await loadConfiguredExternalTools({
      config: this.dependencies.config,
      cwd: this.dependencies.cwd,
      previousFingerprint: this.externalToolsFingerprint,
      toolRegistry: this.dependencies.toolRegistry,
    });
  }
  private canSuggestMemorySave(): boolean {
    return Boolean(this.dependencies.approvalHandler) || canSuggestMemorySave();
  }
  async run(options: AgentRunOptions, callbacks?: AgentCallbacks) {
    const runSpan = startSpan('agent.run', {mode: options.mode, sessionId: this.session.id});
    await this.ensureExternalToolsLoaded();
    this.session.agentSessionId = options.agentSessionId;
    await startMultiAgentSessionIfNeeded(this.dependencies.cwd, options);
    const modeResolution = resolveEffectiveMode({
      allowPromptInference: options.allowModeInference ?? true,
      explicitMode: options.mode,
      prompt: options.prompt,
      sessionMode: this.session.mode,
    });
    const runMode = modeResolution.effectiveMode;
    const routing = resolveProviderRouting({
      config: this.dependencies.config.effective,
      mode: runMode,
      requestedModel: options.model,
      requestedProvider: options.providerName,
    });
    const eventBus = new EventBus();
    this.currentEventBus = eventBus;
    const transcriptPath = getSessionTranscriptPath(this.session.id);
    const recorder = new TranscriptRecorder(this.session.id, transcriptPath);
    const taskState = createTaskState(options.prompt, runMode);
    const approvalManager = createApprovalManager(this.dependencies.config, this.dependencies.approvalHandler, eventBus);
    const hookRuntime = configureToolExecutor({
      approvalManager,
      config: this.dependencies.config,
      cwd: this.dependencies.cwd,
      eventBus,
      options,
      sessionId: this.session.id,
      toolRegistry: this.dependencies.toolRegistry,
    });
    const taskStore = new TaskStore(this.dependencies.cwd);
    const routedProvider = new RoutedProvider(
      this.dependencies.config.effective,
      this.dependencies.providerRegistry,
      routing,
      (from, to, error) => {
        const providerError = toError(error);
        eventBus.emit({
          message: `Primary provider ${from.modelRef} failed (${providerError.message}). Falling back to ${to.modelRef}.`,
          timestamp: createEventTimestamp(),
          type: 'status.updated',
        });
      },
    );
    const removeCallbackBridge = bindAgentCallbacks(eventBus, callbacks);
    const removeRecorder = eventBus.subscribe((event) => {
      recorder.record(event);
    });
    try {
      await hookRuntime.fire('session_start', {
        mode: runMode,
        prompt: options.prompt,
        sessionId: this.session.id,
        skillName: options.skillName,
      });
      if (options.skillName) {
        await hookRuntime.fire('skill_started', {
          prompt: options.prompt,
          sessionId: this.session.id,
          skillName: options.skillName,
        });
        await hookRuntime.fire('before_skill', {
          prompt: options.prompt,
          sessionId: this.session.id,
          skillName: options.skillName,
        });
      }
      const pending = await resolvePendingInstruction({
        prompt: options.prompt,
        session: this.session,
        sessionStore: this.sessionStore,
        skillName: options.skillName,
        taskState,
      });
      if (pending.shortCircuit) {
        runSpan.end({toolCalls: 0});
        return pending.result;
      }
      if (pending.mergedPrompt) options.prompt = pending.mergedPrompt;

      // Deterministic routing chain: combined → error-paste → run/build-fix →
      // autonomous coding → simple action. Each step short-circuits when it
      // matches; otherwise we fall through to the generic agent loop.
      const routed = await tryRouteShortCircuit({
        approvalManager,
        config: this.dependencies.config,
        cwd: this.dependencies.cwd,
        eventBus,
        mode: runMode,
        modeReason: modeResolution.reason,
        options,
        provider: routedProvider,
        routing,
        session: this.session,
        sessionStore: this.sessionStore,
        taskState,
        toolRegistry: this.dependencies.toolRegistry,
        transcriptPath,
      });
      if (routed.handled) {
        runSpan.end({toolCalls: routed.result.toolCalls.length});
        return routed.result;
      }
      const projectContext = await buildProjectContext({
        approvalManager,
        config: this.dependencies.config,
        cwd: this.dependencies.cwd,
        eventBus,
        mode: runMode,
        prompt: options.prompt,
        toolRegistry: this.dependencies.toolRegistry,
      });
      const workflow = resolveAgentWorkflow({
        mode: runMode,
        projectContext,
        prompt: options.prompt,
      });
      const planningMessage = workflow?.plan ?? projectContext.plan;
      await hookRuntime.fire('before_plan', {
        mode: runMode,
        plan: planningMessage,
        prompt: options.prompt,
        sessionId: this.session.id,
      });
      const planningGateResult = await handlePlanningGate({
        approvalManager,
        config: this.dependencies.config,
        cwd: this.dependencies.cwd,
        eventBus,
        mode: runMode,
        options,
        projectContext,
        prompt: options.prompt,
        session: this.session,
      });
      await hookRuntime.fire('after_plan', {
        blocked: planningGateResult.blocked,
        mode: runMode,
        plan: planningMessage,
        prompt: options.prompt,
        sessionId: this.session.id,
      });
      if (options.planOnly) {
        const finalMessage: ChatMessage = {
          content: `Plan created and saved. Plan ID: ${this.session.executingPlanId}. Run 'apeironcode plan approve ${this.session.executingPlanId}' to approve and execute.`,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: 'assistant',
        };
        return {
          finalMessage,
          messages: this.session.messages,
          toolCalls: this.session.toolCalls,
          taskState,
        };
      }
      if (planningGateResult.blocked) {
        const finalMessage: ChatMessage = {
          content: planningGateResult.blocked_reason || 'Plan approval required before proceeding. No code changes were made.',
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: 'assistant',
        };
        return {
          finalMessage,
          messages: this.session.messages,
          toolCalls: this.session.toolCalls,
          taskState,
        };
      }
      let taskTracker: TaskTracker | null = null;
      const existingTask = this.session.taskPlanId
        ? await taskStore.load(this.session.taskPlanId)
        : null;
      if (existingTask && existingTask.status !== 'completed') {
        existingTask.status = 'running';
        existingTask.updatedAt = new Date().toISOString();
        taskState.activeTaskPlanId = existingTask.id;
        this.session.taskPlanId = existingTask.id;
        taskTracker = new TaskTracker(taskStore, existingTask);
        await taskTracker.persist();
      } else if (shouldPersistTask(options.prompt, runMode)) {
        const taskPlan = createTaskPlan({
          goal: options.prompt,
          id: taskStore.createId(),
          linkedSessionId: this.session.id,
          mode: runMode,
          planText: planningMessage,
        });
        taskState.activeTaskPlanId = taskPlan.id;
        this.session.taskPlanId = taskPlan.id;
        taskTracker = new TaskTracker(taskStore, taskPlan);
        await taskTracker.persist();
      }
      let taskWriteChain = Promise.resolve();
      const enqueueTaskSync = (work: () => Promise<void>): void => {
        taskWriteChain = taskWriteChain.then(work).catch(() => undefined);
      };
      if (taskTracker) {
        eventBus.subscribe((event) => {
          switch (event.type) {
            case 'approval.completed':
              enqueueTaskSync(() => taskTracker.recordPermissionDecision(`${event.decision}:${event.request.resource ?? event.request.title}`));
              break;
            case 'todo.updated':
              enqueueTaskSync(() => taskTracker.syncFromTodos(event.todos));
              break;
            case 'tool.completed':
            case 'tool.failed':
            case 'tool.started':
              enqueueTaskSync(() => taskTracker.recordToolCall(event.toolCall, taskState));
              break;
            default:
              break;
          }
        });
      }
      const memoryManager = new MemoryManager(this.dependencies.cwd);
      // Simple deterministic actions and pure chat must not drag the full
      // repo context / memory graph into the payload (root cause of the 413
      // and the irrelevant "8 source files" selection).
      const lightweightPrompt =
        isPureChatIntent(options.prompt) || detectSimpleAction(options.prompt) !== null;
      const preparedPrompt = await preparePromptInputs({
        cwd: this.dependencies.cwd,
        eventBus,
        memoryManager,
        mode: runMode,
        projectContext,
        prompt: options.prompt,
        providerRoute: routing.primary,
        session: this.session,
        toolRegistry: this.dependencies.toolRegistry,
        workflow,
        lightweight: lightweightPrompt,
      });
      const {relevantMemory, systemPrompt, tokenLedger} = preparedPrompt;
      const loadedMemoryReasons = relevantMemory.reasons;
      if (workflow) {
        eventBus.emit({
          message: `Workflow: ${workflow.label}`,
          timestamp: createEventTimestamp(),
          type: 'status.updated',
        });
      }
      const toolContext = {
        approvalManager,
        config: this.dependencies.config.effective,
        cwd: this.dependencies.cwd,
        emitEvent: createToolOutputEmitter(eventBus),
        eventBus,
        executingPlanId: this.session.executingPlanId,
        planningRequired: this.session.planningRequired,
        sessionId: this.session.id,
        agentSessionId: options.agentSessionId,
        signal: options.signal,
        taskState,
      };
      const result = runMode === 'test-fix'
        ? await runManagedTestFixLoop({
            eventBus,
            initialMessages: this.session.messages,
            maxFixAttempts: this.dependencies.config.effective.maxFixAttempts,
            model: routing.primary.model,
        planningMessage,
            prompt: options.prompt,
            provider: routedProvider,
            relevantFiles: projectContext.relevantFiles.map((file) => file.path),
            signal: options.signal,
            systemPrompt,
            taskState,
            tokenLedger,
            testCommand: projectContext.projectScan.testCommand,
            toolContext,
            toolRegistry: this.dependencies.toolRegistry,
          })
        : await runAgentLoop({
            eventBus,
            initialMessages: this.session.messages,
            maxConsecutiveErrors: 2,
            mode: runMode,
            model: routing.primary.model,
            planningMessage,
            provider: routedProvider,
            signal: options.signal,
            systemPrompt,
            taskState,
            tokenLedger,
            toolContext,
            toolRegistry: this.dependencies.toolRegistry,
            userPrompt: options.prompt,
          });
      const usageTotals = routedProvider.getUsageTotals();
      result.usage = usageTotals;
      const memorySuggestions = await maybePersistProjectMemory({
        approvalManager,
        canPromptForApproval: this.canSuggestMemorySave(),
        eventBus,
        memoryManager,
        memoryConfig: this.dependencies.config.effective.memory,
        mode: runMode,
        projectContext,
        prompt: options.prompt,
        result,
      });
      if (memorySuggestions.length > 0) {
        await hookRuntime.fire('memory_suggested', {
          memorySuggestions,
          sessionId: this.session.id,
        });
      }
      if (taskTracker) {
        enqueueTaskSync(() => taskTracker.syncFromTaskState(result.taskState));
        for (const memorySuggestion of memorySuggestions) {
          enqueueTaskSync(() => taskTracker.recordMemorySuggestion(`${memorySuggestion.decision}:${memorySuggestion.category}:${memorySuggestion.summary}`));
        }
      }
      if (shouldAppendStandardizedSummary({
        mode: runMode,
        taskPlan: taskTracker?.current ?? null,
        toolCalls: result.toolCalls,
      }) && !isVerboseOutputEnabled(options.verbose)) {
        // Normal mode: concise footer only. The giant execution summary is
        // debug-only (--verbose / APEIRONCODE_DEBUG=1).
        const concise = buildConciseFinalSummary({
          baseSummary: result.finalMessage.content,
          taskPlan: taskTracker?.current ?? null,
          taskState: result.taskState,
        });
        result.finalMessage.content = concise;
        if (result.taskState) result.taskState.summary = concise;
      } else if (shouldAppendStandardizedSummary({
        mode: runMode,
        taskPlan: taskTracker?.current ?? null,
        toolCalls: result.toolCalls,
      })) {
        const standardizedContent = buildStandardizedFinalSummary({
          baseSummary: result.finalMessage.content,
          codeIntelligenceSummary: projectContext.codeIntelligenceSummary,
          contextSelectionSummary: projectContext.contextSelectionSummary,
          fallbackSummary: routedProvider.getFallbackEvents().length > 0
            ? `Provider fallback: ${routedProvider.getFallbackEvents().map((event) => `${event.from.modelRef} -> ${event.to.modelRef} (${event.reason})`).join('; ')}`
            : 'Provider fallback: none',
          goal: options.prompt,
          memorySuggestions,
          memoryGraphSummary: projectContext.memoryGraphSummary,
          mode: runMode,
          modeLabel: formatEffectiveModeLabel(modeResolution),
          taskPlan: taskTracker?.current ?? null,
          taskState: result.taskState,
          toolCalls: result.toolCalls,
          usage: usageTotals ? {
            breakdown: usageTotals.breakdown,
            estimatedCostUsd: usageTotals.estimatedCostUsd,
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
            totalTokens: usageTotals.totalTokens,
          } : undefined,
        });
        result.finalMessage.content = standardizedContent;
        if (result.taskState) {
          result.taskState.summary = standardizedContent;
        }
        const finalMessageIndex = result.messages.findIndex((message) => message.id === result.finalMessage.id);
        if (finalMessageIndex >= 0) {
          result.messages[finalMessageIndex] = result.finalMessage;
        }
      }
      this.session.lastGoal = options.prompt;
      this.session.messages = result.messages;
      this.session.model = routedProvider.currentRoute.model;
      this.session.mode = runMode;
      this.session.modeReason = modeResolution.reason;
      this.session.plan = result.plan;
      this.session.provider = routedProvider.currentRoute.providerName;
      this.session.taskPlanId = taskTracker?.current.id ?? this.session.taskPlanId;
      this.session.taskState = result.taskState;
      this.session.title = deriveSessionTitle(options.prompt);
      this.session.toolCalls = result.toolCalls;
      this.session.sessionMemory = memoryManager.extractSessionMemoryFromRun({
        finalResult: result.finalMessage.content,
        goal: options.prompt,
        memorySuggestions,
        memoryWhy: loadedMemoryReasons,
        mode: runMode,
        taskState: result.taskState,
        toolCalls: result.toolCalls,
      });
      this.session.tokenUsage = usageTotals
        ? mergeUsageBreakdown(this.session.tokenUsage, usageTotals)
        : this.session.tokenUsage;
      this.session.transcriptPath = transcriptPath;
      this.session.updatedAt = new Date().toISOString();
      await persistRunMemoryGraph({
        cwd: this.dependencies.cwd,
        mode: runMode,
        model: routedProvider.currentRoute.model,
        options,
        providerName: routedProvider.currentRoute.providerName,
        result,
        sessionId: this.session.id,
      });
      await taskWriteChain;
      if (taskTracker) {
        await taskTracker.complete(
          result.finalMessage.content,
          result.taskState?.errors.length ? 'failed' : 'completed',
        );
      }
      await this.sessionStore.save(this.session).catch(() => undefined);
      eventBus.emit({
        sessionId: this.session.id,
        timestamp: createEventTimestamp(),
        transcriptPath,
        type: 'session.saved',
      });
      await hookRuntime.fire('session_complete', {
        mode: runMode,
        sessionId: this.session.id,
        skillName: options.skillName,
        summary: result.finalMessage.content.slice(0, 500),
      });
      if (options.skillName) {
        await hookRuntime.fire('after_skill', {
          sessionId: this.session.id,
          skillName: options.skillName,
          summary: result.finalMessage.content.slice(0, 500),
        });
        await hookRuntime.fire('skill_completed', {
          sessionId: this.session.id,
          skillName: options.skillName,
          summary: result.finalMessage.content.slice(0, 500),
        });
      }
      await completeMultiAgentSessionIfNeeded({
        cwd: this.dependencies.cwd,
        result,
        session: this.session,
      });
      triggerBrainAutoSyncAfterRun(this.dependencies.cwd, options.prompt, result.taskState, result.finalMessage.content);
      runSpan.end({toolCalls: result.toolCalls.length});
      return result;
    } catch (error) {
      const runtimeError = toError(error);
      runSpan.fail(runtimeError);
      eventBus.emit({
        message: runtimeError.message,
        scope: 'agent.run',
        timestamp: createEventTimestamp(),
        type: 'error',
      });
      try {
        await hookRuntime.fire('session_fail', {
          error: runtimeError.message,
          sessionId: this.session.id,
          skillName: options.skillName,
        });
      } catch { /* preserve original agent failure */ }
      await failMultiAgentSessionIfNeeded(this.dependencies.cwd, this.session, runtimeError.message);
      throw error;
    } finally {
      await recorder.save().catch(() => undefined);
      removeRecorder();
      removeCallbackBridge();
    }
  }
  async invokeTool(toolName: string, input: Record<string, unknown>, callbacks?: AgentCallbacks): Promise<ToolResult> {
    await this.ensureExternalToolsLoaded();
    const eventBus = new EventBus();
    this.currentEventBus = eventBus;
    const invocation = await invokeAgentTool({
      approvalHandler: this.dependencies.approvalHandler,
      callbacks,
      config: this.dependencies.config,
      cwd: this.dependencies.cwd,
      eventBus,
      input,
      session: this.session,
      sessionStore: this.sessionStore,
      toolName,
      toolRegistry: this.dependencies.toolRegistry,
    });
    return invocation.result;
  }
}
