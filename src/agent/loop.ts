import crypto from 'node:crypto';
import {
  finalizeTaskState,
  recordTaskError,
  updateTaskPlan,
} from '../core/agent/state.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ModelProvider, ProviderUsage} from '../providers/types.js';
import {toError} from '../utils/errors.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolExecutionContext} from '../tools/types.js';
import {selectToolsForPrompt} from '../tools/exposurePolicy.js';
import {startSpan} from '../utils/trace.js';
import {createTokenLedger, formatTokenLedger, recordCompletionTokens, recordConversationTokens, recordPromptTokens, recordToolResultTokens, recordToolSchemaTokens, summarizeTokenLedger, type TokenLedger} from '../tokens/accounting.js';
import {getModelTokenBudget} from '../tokens/providerBudgets.js';
import {estimateTokens} from '../tokens/estimate.js';
import {type RuntimeCheckpoint} from './checkpoints.js';
import {RuntimeController} from './runtimeController.js';
import {classifyRuntimeFailure} from './recoveryPolicy.js';
import {analyzeBudget} from './budgetAdvisor.js';
import {LoopProgressTracker, type OverallProgress} from './loopProgress.js';
import {
  emitMessage,
  emitTodoUpdate,
  MAX_CONFIGURABLE_ITERATIONS,
  toProviderMessages,
} from './loopHelpers.js';
import {compactConversationHistory} from './historyCompactor.js';
import {executeSingleToolCall} from './toolExecutionRuntime.js';
import {
  formatToolBatchSummary,
  shouldSummarizeToolBatch,
  summarizeToolBatch,
  type ToolCall as BatchToolCall,
  type ToolCallResult as BatchToolCallResult,
} from './toolBatchSummary.js';
import {logger} from '../utils/logger.js';
import {createParallelGroupNotifier} from './toolResultMessages.js';
import {executeOrchestrated, planToolCallExecution} from './toolCallOrchestrator.js';
import {
  applyCompletionGateFeedback,
  deriveRunStateFromToolCalls,
  evaluateRunCompletionGates,
} from './completionGateRuntime.js';
import {emitStopHook} from './hookRuntime.js';
import {
  createAuthFailureMessage,
  createConsecutiveErrorsMessage,
  createConsecutiveToolFailuresMessage,
  createMaxIterationsMessage,
  createStalledFinalMessage,
} from './loopFinalMessages.js';
import type {
  AgentTaskState,
  AgentMode,
  AgentRunResult,
  ChatMessage,
  ToolCallRecord,
} from './types.js';
interface AgentLoopOptions {
  eventBus?: EventBus;
  initialMessages: ChatMessage[];
  maxConsecutiveErrors?: number;
  maxIterations?: number;
  mode?: AgentMode;
  model: string;
  planningMessage?: string | null;
  provider: ModelProvider;
  signal?: AbortSignal;
  systemPrompt: string;
  taskState?: AgentTaskState;
  tokenLedger?: TokenLedger;
  toolContext: ToolExecutionContext;
  toolRegistry: ToolRegistry;
  userPrompt: string;
}
export const runAgentLoop = async ({
  eventBus,
  initialMessages,
  maxConsecutiveErrors = 2,
  maxIterations,
  mode = 'chat',
  model,
  planningMessage,
  provider,
  signal,
  systemPrompt,
  taskState,
  tokenLedger = createTokenLedger(),
  toolContext,
  toolRegistry,
  userPrompt,
}: AgentLoopOptions): Promise<AgentRunResult> => {
  const messages = [...initialMessages];
  const toolCalls: ToolCallRecord[] = [];
  let lastUsage: ProviderUsage | undefined;
  let consecutiveErrors = 0;
  const progressTracker = new LoopProgressTracker();
  const runtime = new RuntimeController(eventBus);
  let latestCheckpoint: RuntimeCheckpoint | undefined;
  runtime.startRun();
  const configuredMaxIterations = Math.min(Math.max(toolContext.config.maxIterations ?? 40, 5), MAX_CONFIGURABLE_ITERATIONS);
  const budgetAdvice = maxIterations === undefined
    ? analyzeBudget(userPrompt, mode, configuredMaxIterations)
    : {
        reason: 'Caller provided an explicit max iteration count.',
        recommended: Math.min(Math.max(maxIterations, 1), MAX_CONFIGURABLE_ITERATIONS),
        signals: ['explicit-max-iterations'],
      };
  const iterationBudget = budgetAdvice.recommended;
  const userMessage: ChatMessage = {
    content: userPrompt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
  };
  messages.push(userMessage);
  recordPromptTokens(tokenLedger, systemPrompt);
  tokenLedger.categories.user += estimateTokens(userPrompt);
  emitMessage(eventBus, userMessage);
  if (planningMessage) {
    if (taskState) {
      updateTaskPlan(taskState, planningMessage);
    }
    const planMessage: ChatMessage = {
      content: planningMessage,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      role: 'assistant',
    };
    messages.push(planMessage);
    emitMessage(eventBus, planMessage);
    emitTodoUpdate(eventBus, taskState);
  }
  const emitProgress = (iteration: number, progress: OverallProgress): void => {
    eventBus?.emit({
      budget: iterationBudget,
      iteration,
      progress,
      remainingBudget: Math.max(0, iterationBudget - iteration),
      timestamp: createEventTimestamp(),
      type: 'loop.progress',
    });
  };
  const finalizeUsage = (): ProviderUsage | undefined => {
    const summary = summarizeTokenLedger(tokenLedger);
    eventBus?.emit({
      summary: formatTokenLedger(tokenLedger),
      timestamp: createEventTimestamp(),
      totalEstimatedTokens: summary.totalEstimatedTokens,
      type: 'token.ledger_updated',
    });
    return lastUsage ? {...lastUsage, tokenBreakdown: summary.breakdown} : {tokenBreakdown: summary.breakdown};
  };
  outer: for (let iteration = 0; iteration < iterationBudget; iteration += 1) {
    eventBus?.emit({
      message: `Thinking ${iteration + 1}/${iterationBudget}`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    runtime.startPlanning(iteration + 1);
    let currentText = '';
    const toolUseBuffer = new Map<string, {id: string; name: string; input: string}>();
    let activeToolUseId: string | undefined;
    const streamingMessageId = crypto.randomUUID();
    const configuredTokenEfficiency = toolContext.config.tokenEfficiency;
    const tokenEfficiency = {enabled: configuredTokenEfficiency?.enabled ?? true, tools: {
      dynamicExposureEnabled: configuredTokenEfficiency?.tools?.dynamicExposureEnabled ?? true,
      maxToolOutputTokens: configuredTokenEfficiency?.tools?.maxToolOutputTokens ?? 1_200,
    }};
    try {
      eventBus?.emit({
        messageId: streamingMessageId,
        role: 'assistant',
        timestamp: createEventTimestamp(),
        type: 'message.started',
      });
      const budgetProfile = getModelTokenBudget(provider.name, model, mode);
      const exposureDecision = tokenEfficiency.tools.dynamicExposureEnabled
        ? selectToolsForPrompt(userPrompt, mode, toolRegistry.list(), {
            maxSchemaTokens: budgetProfile.toolSchemaBudget,
            providerCapabilities: {nativeToolCalling: provider.supportsToolCalling},
          })
        : selectToolsForPrompt(userPrompt, 'full', toolRegistry.list(), {forceFull: true});
      eventBus?.emit({
        estimatedSchemaTokens: exposureDecision.estimatedSchemaTokens,
        excludedCount: exposureDecision.excludedTools.length,
        includedTools: exposureDecision.includedTools,
        timestamp: createEventTimestamp(),
        type: 'tools.exposure_selected',
      });
      if (exposureDecision.estimatedSchemaTokens > budgetProfile.toolSchemaBudget) {
        eventBus?.emit({
          budget: budgetProfile.toolSchemaBudget,
          category: 'tool_schemas',
          observed: exposureDecision.estimatedSchemaTokens,
          timestamp: createEventTimestamp(),
          type: 'token.budget_exceeded',
        });
      }
      const toolDefinitionBundle = toolRegistry.getProviderToolDefinitionsBundleFor(exposureDecision.includedTools, {
        minifyForProvider: provider.name,
      });
      const toolDefinitions = toolDefinitionBundle.definitions;
      recordToolSchemaTokens(tokenLedger, exposureDecision.estimatedSchemaTokens, toolDefinitionBundle.tokensSaved);
      if (toolDefinitionBundle.tokensSaved > 0) {
        eventBus?.emit({
          timestamp: createEventTimestamp(),
          tokensSaved: toolDefinitionBundle.tokensSaved,
          toolName: `${toolDefinitions.length} tools`,
          type: 'tool_schema.minified',
        });
        eventBus?.emit({
          timestamp: createEventTimestamp(),
          tokensSaved: toolDefinitionBundle.tokensSaved,
          type: 'token.schema_minified',
        });
      }
      const historyCompaction = compactConversationHistory(messages, {maxTokens: budgetProfile.historyBudget});
      if (historyCompaction.report.compactedTokens < historyCompaction.report.originalTokens) {
        eventBus?.emit({
          compactedTokens: historyCompaction.report.compactedTokens,
          originalTokens: historyCompaction.report.originalTokens,
          timestamp: createEventTimestamp(),
          type: 'token.history_compacted',
        });
      }
      const providerMessages = toProviderMessages(historyCompaction.messages, systemPrompt);
      for (const message of historyCompaction.messages) {
        if (message.role !== 'user') {
          recordConversationTokens(tokenLedger, message.content);
        }
      }
      const providerSpan = startSpan('provider.stream', {model, provider: provider.name, toolCount: toolDefinitions.length});
      try {
        for await (const chunk of provider.stream({
          messages: providerMessages,
          model,
          signal,
          temperature: 0.2,
          tools: toolDefinitions,
        })) {
          if (chunk.type === 'token') {
            currentText += chunk.token ?? '';
            eventBus?.emit({
              delta: chunk.token ?? '',
              messageId: streamingMessageId,
              timestamp: createEventTimestamp(),
              type: 'message.delta',
            });
          } else if (chunk.type === 'tool_use_start') {
            activeToolUseId = chunk.toolUseId;
            if (activeToolUseId && chunk.toolName) {
              toolUseBuffer.set(activeToolUseId, {
                id: activeToolUseId,
                name: chunk.toolName,
                input: '',
              });
            }
          } else if (chunk.type === 'tool_use_delta') {
            if (activeToolUseId) {
              const buffer = toolUseBuffer.get(activeToolUseId);
              if (buffer) {
                buffer.input += chunk.toolInputDelta ?? '';
              }
            }
          } else if (chunk.type === 'tool_use_end') {
            activeToolUseId = undefined;
          } else if (chunk.type === 'done') {
            lastUsage = chunk.usage;
          }
        }
        providerSpan.end();
      } catch (error) {
        providerSpan.fail(error);
        throw error;
      }
    } catch (error) {
      const toolError = toError(error);
      consecutiveErrors += 1;
      const failure = classifyRuntimeFailure(toolError);
      runtime.startRecovery(failure.message);
      if (taskState) {
        recordTaskError(taskState, toolError.message);
      }
      eventBus?.emit({
        message: toolError.message,
        scope: 'provider',
        timestamp: createEventTimestamp(),
        type: 'error',
      });
      // Provider auth failures and payload rejections (400/422) are
      // non-recoverable: do not retry, do not spin, fail fast with one
      // clean actionable message (no repeated empty assistant blocks).
      if (failure.type === 'auth_failed' || failure.type === 'provider_rejected') {
        runtime.failRun('recovery_exhausted', failure.message);
        // Reuse the streaming message id so the one clean error block
        // replaces the empty in-flight assistant block instead of adding a
        // second one (no repeated empty ASSISTANT / ▊ sections).
        const finalMessage = createAuthFailureMessage(toolError.message, streamingMessageId);
        messages.push(finalMessage);
        recordCompletionTokens(tokenLedger, finalMessage.content);
        if (taskState) {
          finalizeTaskState(taskState, finalMessage.content);
        }
        emitMessage(eventBus, finalMessage);
        return {
          finalMessage,
          plan: planningMessage,
          messages,
          taskState,
          toolCalls,
          usage: finalizeUsage(),
        };
      }
      if (consecutiveErrors >= maxConsecutiveErrors) {
        runtime.failRun('recovery_exhausted', toolError.message);
        const finalMessage = createConsecutiveErrorsMessage(consecutiveErrors, toolError.message);
        messages.push(finalMessage);
        recordCompletionTokens(tokenLedger, finalMessage.content);
        if (taskState) {
          finalizeTaskState(taskState, finalMessage.content);
        }
        emitMessage(eventBus, finalMessage);
        return {
          finalMessage,
          plan: planningMessage,
          messages,
          taskState,
          toolCalls,
          usage: finalizeUsage(),
        };
      }
      continue;
    }
    // If no tool calls, this is the final message
    if (toolUseBuffer.size === 0) {
      // Phase 16B: Evaluate completion gates and append feedback if any.
      const runState = deriveRunStateFromToolCalls(toolCalls, userPrompt);
      const gateResult = evaluateRunCompletionGates(runState);
      const baseContent = currentText.trim();
      const gatedContent = applyCompletionGateFeedback(baseContent, gateResult);
      const finalMessage: ChatMessage = {
        content: gatedContent,
        createdAt: new Date().toISOString(),
        id: streamingMessageId,
        role: 'assistant',
      };
      messages.push(finalMessage);
      recordCompletionTokens(tokenLedger, finalMessage.content);
      if (taskState) {
        finalizeTaskState(taskState, finalMessage.content);
      }
      eventBus?.emit({
        message: finalMessage,
        timestamp: createEventTimestamp(),
        type: 'message.completed',
      });
      runtime.completeRun();
      // Phase 16B: emit Stop hook (best-effort).
      await emitStopHook(toolContext.cwd);
      return {
        finalMessage,
        plan: planningMessage,
        messages,
        taskState,
        toolCalls,
        usage: finalizeUsage(),
      };
    }
    // Add assistant message with streaming text
    const assistantMessage: ChatMessage = {
      content: currentText.trim(),
      createdAt: new Date().toISOString(),
      id: streamingMessageId,
      role: 'assistant',
    };
    messages.push(assistantMessage);
    eventBus?.emit({
      message: assistantMessage,
      timestamp: createEventTimestamp(),
      type: 'message.completed',
    });
    // Execute tool calls (orchestrated: read-only parallel, writes serialized)
    const orderedToolUses = Array.from(toolUseBuffer.values());
    const iterationToolCalls: ToolCallRecord[] = [];
    const checkpointRef: {value: RuntimeCheckpoint | undefined} = {value: latestCheckpoint};
    const groupNotifier = createParallelGroupNotifier(eventBus);
    const plan = planToolCallExecution(orderedToolUses.map((t) => ({id: t.id, name: t.name})));
    for (const group of plan.groups) {
      if (group.parallel && group.callIndices.length > 1) {
        groupNotifier.start(group.callIndices.map((i) => orderedToolUses[i]!.name));
      }
    }
    const orchestrated = await executeOrchestrated(
      orderedToolUses.map((t) => ({id: t.id, name: t.name, input: t.input})),
      async (id, name) => {
        const toolUse = orderedToolUses.find((t) => t.id === id) ?? {id, name, input: ''};
        const outcome = await executeSingleToolCall({
          toolUse,
          iteration,
          consecutiveErrorsBefore: consecutiveErrors,
          toolContext,
          toolRegistry,
          runtime,
          eventBus,
          taskState,
          tokenEfficiency,
          latestCheckpointRef: checkpointRef,
        });
        return outcome;
      },
    );
    latestCheckpoint = checkpointRef.value;
    let halt = false;
    let haltError: string | undefined;
    for (let i = 0; i < orchestrated.length; i += 1) {
      const entry = orchestrated[i]!;
      if (entry.error) {
        // executor itself threw (rare — single-tool runtime catches normally)
        consecutiveErrors += 1;
        const errorMessage: ChatMessage = {
          content: `Tool ${entry.toolName} failed: ${entry.error.message}`,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: 'tool',
        };
        messages.push(errorMessage);
        recordToolResultTokens(tokenLedger, errorMessage.content);
        emitMessage(eventBus, errorMessage);
        if (consecutiveErrors >= maxConsecutiveErrors) {
          halt = true;
          haltError = entry.error.message;
          break;
        }
        continue;
      }
      const out = entry.result as Awaited<ReturnType<typeof executeSingleToolCall>>;
      toolCalls.push(out.toolCall);
      iterationToolCalls.push(out.toolCall);
      messages.push(out.resultMessage);
      recordToolResultTokens(tokenLedger, out.resultMessage.content);
      emitMessage(eventBus, out.resultMessage);
      if (out.resetErrors) {
        consecutiveErrors = 0;
      }
      if (out.errorIncrement > 0) {
        consecutiveErrors += out.errorIncrement;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          halt = true;
          haltError = out.toolCall.error ?? 'tool failure';
          break;
        }
      }
    }
    for (const group of plan.groups) {
      if (group.parallel && group.callIndices.length > 1) {
        const names = group.callIndices.map((i) => orderedToolUses[i]!.name);
        const succeeded = group.callIndices.filter((i) => {
          const e = orchestrated[i];
          if (!e || e.error) return false;
          const out = e.result as Awaited<ReturnType<typeof executeSingleToolCall>>;
          return out.toolCall.status === 'success';
        }).length;
        groupNotifier.complete(names, succeeded, names.length - succeeded);
      }
    }
    if (halt && haltError) {
      runtime.failRun('recovery_exhausted', haltError);
      const finalMessage = createConsecutiveToolFailuresMessage(consecutiveErrors, haltError);
      messages.push(finalMessage);
      recordCompletionTokens(tokenLedger, finalMessage.content);
      if (taskState) {
        finalizeTaskState(taskState, finalMessage.content);
      }
      emitMessage(eventBus, finalMessage);
      return {
        finalMessage,
        plan: planningMessage,
        messages,
        taskState,
        toolCalls,
        usage: finalizeUsage(),
      };
    }
    const batchCalls: BatchToolCall[] = orderedToolUses.map((t) => ({
      id: t.id,
      name: t.name,
      input: ((): Record<string, unknown> => {
        try {
          const parsed: unknown = t.input ? JSON.parse(t.input) : {};
          return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      })(),
    }));
    if (shouldSummarizeToolBatch(batchCalls)) {
      const batchResults: BatchToolCallResult[] = iterationToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.toolName,
        ok: tc.status === 'success',
        summary: tc.result?.summary ?? tc.error ?? '',
        filesChanged: typeof tc.input?.path === 'string'
          ? [tc.input.path]
          : undefined,
      }));
      const batchSummary = summarizeToolBatch(batchCalls, batchResults);
      logger.debug('tool batch summary', {summary: formatToolBatchSummary(batchSummary)});
    }
    const completedIteration = iteration + 1;
    const summary = progressTracker.record(completedIteration, iterationToolCalls);
    const progress = progressTracker.totalProgress();
    emitProgress(completedIteration, progress);
    if (progressTracker.isStalled(3)) {
      const reason = progress.stalledReason ?? progressTracker.stalledReason();
      eventBus?.emit({
        iteration: completedIteration,
        progress,
        reason,
        timestamp: createEventTimestamp(),
        type: 'loop.stalled',
      });
      eventBus?.emit({
        message: `Loop stalled: ${reason}`,
        timestamp: createEventTimestamp(),
        type: 'status.updated',
      });
      const finalMessage = createStalledFinalMessage(progress, progressTracker.stalledReason());
      runtime.failRun('recovery_exhausted', progress.stalledReason ?? 'loop stalled');
      messages.push(finalMessage);
      recordCompletionTokens(tokenLedger, finalMessage.content);
      if (taskState) {
        finalizeTaskState(taskState, finalMessage.content);
      }
      emitMessage(eventBus, finalMessage);
      return {
        finalMessage,
        plan: planningMessage,
        messages,
        taskState,
        toolCalls,
        usage: finalizeUsage(),
      };
    }
    if (summary.errorsEncountered > 0 && consecutiveErrors >= maxConsecutiveErrors) {
      continue outer;
    }
  }
  const finalMessage = createMaxIterationsMessage(iterationBudget, budgetAdvice.reason);
  messages.push(finalMessage);
  recordCompletionTokens(tokenLedger, finalMessage.content);
  if (taskState) {
    finalizeTaskState(taskState, finalMessage.content);
  }
  emitMessage(eventBus, finalMessage);
  runtime.failRun('recovery_exhausted', finalMessage.content);
  await emitStopHook(toolContext.cwd);
  return {
    finalMessage,
    plan: planningMessage,
    messages,
    taskState,
    toolCalls,
    usage: finalizeUsage(),
  };
};
