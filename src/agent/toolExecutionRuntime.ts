import crypto from 'node:crypto';

import {
  recordTaskError,
  recordToolCompletion,
  recordToolStart,
} from '../core/agent/state.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {toError} from '../utils/errors.js';
import {startSpan} from '../utils/trace.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolExecutionContext, ToolResult} from '../tools/types.js';
import {redactSecretLikeContent} from '../memory/safety.js';
import {createCheckpoint, restoreCheckpoint, type RuntimeCheckpoint} from './checkpoints.js';
import type {RuntimeController} from './runtimeController.js';
import {classifyRuntimeFailure, formatRecoveryInstruction, planRecovery} from './recoveryPolicy.js';
import {parseToolUseInput} from './toolUseParsing.js';
import {isMissingRequiredToolInputError} from './toolInputRepair.js';
import {CHECKPOINTED_TOOLS, emitTodoUpdate, VERIFY_TOOLS} from './loopHelpers.js';
import {buildToolResultMessage, emitNormalizedToolResultEvent} from './toolResultMessages.js';
import {
  emitPostToolUseFailureHook,
  emitPostToolUseHook,
  emitPreToolUseHook,
  isBlockingHookResult,
} from './hookRuntime.js';
import type {AgentTaskState, ChatMessage, ToolCallRecord} from './types.js';

export interface SingleToolExecutionParams {
  toolUse: {id: string; name: string; input: string};
  iteration: number;
  consecutiveErrorsBefore: number;
  toolContext: ToolExecutionContext;
  toolRegistry: ToolRegistry;
  runtime: RuntimeController;
  eventBus?: EventBus;
  taskState?: AgentTaskState;
  tokenEfficiency: {enabled: boolean; tools: {maxToolOutputTokens: number}};
  latestCheckpointRef: {value: RuntimeCheckpoint | undefined};
}

export interface SingleToolExecutionResult {
  toolCall: ToolCallRecord;
  resultMessage: ChatMessage;
  errorIncrement: number;
  resetErrors: boolean;
}

const createSafeToolCallEventRecord = (
  toolCall: ToolCallRecord,
  summary: string,
  output: string,
): ToolCallRecord => ({
  ...toolCall,
  result: toolCall.result
    ? {
        ...toolCall.result,
        output: redactSecretLikeContent(output),
        summary: redactSecretLikeContent(summary),
      }
    : toolCall.result,
});

/**
 * Run one tool call through the registry, applying checkpoint, verification,
 * recovery, and result-message normalization. Mirrors the previous inline logic
 * inside loop.ts so that the orchestrator wrapper can call this safely.
 */
export const executeSingleToolCall = async (
  params: SingleToolExecutionParams,
): Promise<SingleToolExecutionResult> => {
  const {
    toolUse,
    iteration,
    toolContext,
    toolRegistry,
    runtime,
    eventBus,
    taskState,
    tokenEfficiency,
    latestCheckpointRef,
  } = params;

  const parsedToolUse = parseToolUseInput(toolUse);
  if (parsedToolUse.errorMessage) {
    const failure = classifyRuntimeFailure(parsedToolUse.errorMessage);
    runtime.startRecovery(failure.message);
    const toolCall: ToolCallRecord = {
      createdAt: new Date().toISOString(),
      error: parsedToolUse.errorMessage,
      id: crypto.randomUUID(),
      input: {},
      status: 'error',
      toolName: toolUse.name,
    };
    const toolResult: ChatMessage = {
      content: parsedToolUse.errorMessage,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      role: 'tool',
    };
    runtime.completeRecovery(
      true,
      formatRecoveryInstruction(planRecovery(failure, {attempts: params.consecutiveErrorsBefore})),
    );
    return {toolCall, resultMessage: toolResult, errorIncrement: 0, resetErrors: false};
  }

  const toolInput = parsedToolUse.parsedInput;
  const toolCall: ToolCallRecord = {
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    input: toolInput as Record<string, unknown>,
    status: 'running',
    toolName: toolUse.name,
  };

  if (taskState) recordToolStart(taskState, toolCall);
  eventBus?.emit({
    timestamp: createEventTimestamp(),
    toolCall,
    type: 'tool.started',
  });

  // Hook v2: PreToolUse — may block tool execution.
  const preHookResult = await emitPreToolUseHook(
    toolUse.name,
    toolInput as Record<string, unknown>,
    toolContext.cwd,
  );
  if (isBlockingHookResult(preHookResult)) {
    const blockMessage = preHookResult.message ?? `Tool ${toolUse.name} blocked by hook.`;
    toolCall.error = blockMessage;
    toolCall.status = 'error';
    runtime.finishToolExecution(toolCall);
    if (taskState) {
      recordToolCompletion(taskState, toolCall);
      recordTaskError(taskState, blockMessage);
    }
    eventBus?.emit({
      timestamp: createEventTimestamp(),
      toolCall,
      type: 'tool.failed',
    });
    const errorMessage: ChatMessage = {
      content: `Tool ${toolUse.name} blocked: ${blockMessage}`,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      role: 'tool',
    };
    return {toolCall, resultMessage: errorMessage, errorIncrement: 0, resetErrors: false};
  }

  if (CHECKPOINTED_TOOLS.has(toolUse.name)) {
    try {
      const checkpoint = await createCheckpoint(toolContext.cwd, {
        reason: `before ${toolUse.name}`,
        sessionId: toolContext.sessionId,
      });
      latestCheckpointRef.value = checkpoint;
      runtime.startCheckpoint(checkpoint.id);
    } catch (error) {
      runtime.failRun('checkpoint_failed', toError(error).message);
      throw error;
    }
  }
  runtime.startToolExecution(toolUse.name, iteration + 1);
  emitTodoUpdate(eventBus, taskState);

  try {
    const toolSpan = startSpan('tool.execute', {toolName: toolUse.name});
    let result: ToolResult;
    try {
      result = await toolRegistry.invoke(toolUse.name, toolInput, toolContext);
      toolSpan.end({ok: result.ok});
    } catch (error) {
      toolSpan.fail(error);
      throw error;
    }

    toolCall.result = result;
    toolCall.status = 'success';
    runtime.finishToolExecution(toolCall);

    if (result.metadata) {
      const meta = result.metadata;
      if (meta.permissionDecision) {
        toolCall.permissionDecision = meta.permissionDecision as ToolCallRecord['permissionDecision'];
      }
      if (meta.riskLevel) toolCall.riskLevel = meta.riskLevel as ToolCallRecord['riskLevel'];
      if (typeof meta.matchedRule === 'string') toolCall.matchedRule = meta.matchedRule;
      if (typeof meta.durationMs === 'number') toolCall.durationMs = meta.durationMs;
    }

    const {message, normalized, compressedRatio, originalTokenEstimate, compressedTokenEstimate} =
      buildToolResultMessage(toolUse.name, result, {
        compressionEnabled: tokenEfficiency.enabled,
        maxTokens: tokenEfficiency.tools.maxToolOutputTokens,
      });

    if (taskState) recordToolCompletion(taskState, toolCall);
    eventBus?.emit({
      timestamp: createEventTimestamp(),
      toolCall: createSafeToolCallEventRecord(toolCall, normalized.summary, normalized.output),
      type: 'tool.completed',
    });

    const checkpoint = latestCheckpointRef.value;
    if (!result.ok && VERIFY_TOOLS.has(toolUse.name) && checkpoint) {
      runtime.startVerification(toolUse.name);
      runtime.startRollback(checkpoint.id);
      const restored = await restoreCheckpoint(checkpoint);
      runtime.completeRollback(
        checkpoint.id,
        true,
        `Restored ${restored.restored.length}; removed ${restored.removed.length}; skipped ${restored.skipped.length}`,
      );
      runtime.completeVerification(false, `${toolUse.name} failed; checkpoint restored.`);
    } else if (VERIFY_TOOLS.has(toolUse.name)) {
      runtime.startVerification(toolUse.name);
      runtime.completeVerification(result.ok, result.summary);
    } else if (!result.ok) {
      const failure = classifyRuntimeFailure('', result);
      const recovery = planRecovery(failure, {
        attempts: params.consecutiveErrorsBefore,
        checkpointAvailable: Boolean(checkpoint),
        riskyEdit: Boolean(checkpoint),
      });
      runtime.startRecovery(failure.message);
      runtime.completeRecovery(recovery.action !== 'mark_failed', formatRecoveryInstruction(recovery));
    }
    emitTodoUpdate(eventBus, taskState);

    if (compressedRatio !== undefined && compressedRatio < 1) {
      eventBus?.emit({
        compressedTokenEstimate: compressedTokenEstimate ?? 0,
        originalTokenEstimate: originalTokenEstimate ?? 0,
        timestamp: createEventTimestamp(),
        toolName: toolUse.name,
        type: 'tool_output.compressed',
      });
      eventBus?.emit({
        compressedTokenEstimate: compressedTokenEstimate ?? 0,
        originalTokenEstimate: originalTokenEstimate ?? 0,
        timestamp: createEventTimestamp(),
        toolName: toolUse.name,
        type: 'token.tool_output_compressed',
      });
    }
    emitNormalizedToolResultEvent(eventBus, normalized);

    // Hook v2: PostToolUse (fire-and-record, never blocks completion path).
    await emitPostToolUseHook(toolUse.name, normalized.summary, toolContext.cwd);

    return {toolCall, resultMessage: message, errorIncrement: 0, resetErrors: true};
  } catch (error) {
    const toolError = toError(error);
    toolCall.error = toolError.message;
    toolCall.status = 'error';
    const failure = classifyRuntimeFailure(toolError);
    runtime.finishToolExecution(toolCall);
    runtime.startRecovery(failure.message);

    if (taskState) {
      recordToolCompletion(taskState, toolCall);
      recordTaskError(taskState, toolError.message);
    }
    eventBus?.emit({
      timestamp: createEventTimestamp(),
      toolCall,
      type: 'tool.failed',
    });
    eventBus?.emit({
      message: toolError.message,
      scope: toolUse.name,
      timestamp: createEventTimestamp(),
      type: 'error',
    });
    emitTodoUpdate(eventBus, taskState);

    const errorMessage: ChatMessage = {
      content: `Tool ${toolUse.name} failed: ${toolError.message}`,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      role: 'tool',
    };

    // Hook v2: PostToolUseFailure (best-effort, never throws into the loop).
    await emitPostToolUseFailureHook(toolUse.name, toolError.message, toolContext.cwd);

    return {
      toolCall,
      resultMessage: errorMessage,
      errorIncrement: isMissingRequiredToolInputError(toolError) ? 2 : 1,
      resetErrors: false,
    };
  }
};
