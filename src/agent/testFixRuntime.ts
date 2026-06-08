import crypto from 'node:crypto';

import {
  finalizeTaskState,
  recordTaskError,
  recordToolCompletion,
  recordToolStart,
} from '../core/agent/state.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ModelProvider, ProviderUsage} from '../providers/types.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolExecutionContext, ToolResult} from '../tools/types.js';
import {toError} from '../utils/errors.js';
import type {TokenLedger} from '../tokens/accounting.js';
import {runAgentLoop} from './loop.js';
import {createTestFixContext} from './testFixWorkflow.js';
import type {AgentRunResult, AgentTaskState, ChatMessage, ToolCallRecord} from './types.js';

interface TestFixRuntimeOptions {
  eventBus?: EventBus;
  initialMessages: ChatMessage[];
  maxFixAttempts: number;
  model: string;
  planningMessage?: string | null;
  prompt: string;
  provider: ModelProvider;
  relevantFiles: string[];
  signal?: AbortSignal;
  systemPrompt: string;
  taskState?: AgentTaskState;
  testCommand?: string | null;
  tokenLedger?: TokenLedger;
  toolContext: ToolExecutionContext;
  toolRegistry: ToolRegistry;
}

const EDIT_TOOL_NAMES = new Set(['edit_file', 'patch_file', 'write_file']);

const prioritizeRelevantFiles = (files: string[]): string[] => {
  return [...files].sort((left, right) => {
    const score = (value: string): number => {
      if (value.startsWith('src/')) {
        return 0;
      }
      if (value.startsWith('tests/') || value.includes('.test.') || value.includes('.spec.')) {
        return 1;
      }
      return 2;
    };

    return score(left) - score(right);
  });
};

const emitMessage = (eventBus: EventBus | undefined, message: ChatMessage): void => {
  if (!eventBus) {
    return;
  }

  eventBus.emit({
    messageId: message.id,
    role: message.role,
    timestamp: createEventTimestamp(),
    type: 'message.started',
  });
  eventBus.emit({
    message,
    timestamp: createEventTimestamp(),
    type: 'message.completed',
  });
};

const emitTodoUpdate = (eventBus: EventBus | undefined, taskState?: AgentTaskState): void => {
  if (!eventBus || !taskState) {
    return;
  }

  eventBus.emit({
    timestamp: createEventTimestamp(),
    todos: [...taskState.todos],
    type: 'todo.updated',
  });
};

const applyResultMetadata = (toolCall: ToolCallRecord, result: ToolResult): void => {
  if (!result.metadata) {
    return;
  }

  if (result.metadata.permissionDecision) {
    toolCall.permissionDecision = result.metadata.permissionDecision as ToolCallRecord['permissionDecision'];
  }
  if (result.metadata.riskLevel) {
    toolCall.riskLevel = result.metadata.riskLevel as ToolCallRecord['riskLevel'];
  }
  if (result.metadata.matchedRule) {
    toolCall.matchedRule = result.metadata.matchedRule as string;
  }
  if (result.metadata.durationMs !== undefined) {
    toolCall.durationMs = result.metadata.durationMs as number;
  }
};

const createToolMessage = (toolName: string, result: ToolResult): ChatMessage => ({
  content: [
    `Tool result for ${toolName}:`,
    result.summary,
    result.output,
  ]
    .filter(Boolean)
    .join('\n\n'),
  createdAt: new Date().toISOString(),
  id: crypto.randomUUID(),
  role: 'tool',
});

const createErrorToolMessage = (toolName: string, errorMessage: string): ChatMessage => ({
  content: `Tool ${toolName} failed: ${errorMessage}`,
  createdAt: new Date().toISOString(),
  id: crypto.randomUUID(),
  role: 'tool',
});

const invokeToolWithTracking = async ({
  eventBus,
  input,
  messages,
  taskState,
  toolCalls,
  toolContext,
  toolName,
  toolRegistry,
}: {
  eventBus?: EventBus;
  input: Record<string, unknown>;
  messages: ChatMessage[];
  taskState?: AgentTaskState;
  toolCalls: ToolCallRecord[];
  toolContext: ToolExecutionContext;
  toolName: string;
  toolRegistry: ToolRegistry;
}): Promise<ToolResult> => {
  const toolCall: ToolCallRecord = {
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    input,
    status: 'running',
    toolName,
  };
  toolCalls.push(toolCall);
  if (taskState) {
    recordToolStart(taskState, toolCall);
  }
  eventBus?.emit({
    timestamp: createEventTimestamp(),
    toolCall,
    type: 'tool.started',
  });
  emitTodoUpdate(eventBus, taskState);

  try {
    const result = await toolRegistry.invoke(toolName, input, toolContext);
    toolCall.result = result;
    toolCall.status = 'success';
    applyResultMetadata(toolCall, result);

    if (taskState) {
      recordToolCompletion(taskState, toolCall);
    }
    eventBus?.emit({
      timestamp: createEventTimestamp(),
      toolCall,
      type: 'tool.completed',
    });
    emitTodoUpdate(eventBus, taskState);

    const toolMessage = createToolMessage(toolName, result);
    messages.push(toolMessage);
    emitMessage(eventBus, toolMessage);
    return result;
  } catch (error) {
    const toolError = toError(error);
    toolCall.error = toolError.message;
    toolCall.status = 'error';
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
      scope: toolName,
      timestamp: createEventTimestamp(),
      type: 'error',
    });
    emitTodoUpdate(eventBus, taskState);

    const toolMessage = createErrorToolMessage(toolName, toolError.message);
    messages.push(toolMessage);
    emitMessage(eventBus, toolMessage);
    throw toolError;
  }
};

const buildAttemptPrompt = ({
  attempt,
  failedTests,
  originalPrompt,
  relevantFiles,
  strategy,
  summary,
  testCommand,
}: {
  attempt: number;
  failedTests: string[];
  originalPrompt: string;
  relevantFiles: string[];
  strategy: string;
  summary: string;
  testCommand: string;
}): string => {
  const likelyFiles = relevantFiles.length > 0
    ? relevantFiles.slice(0, 6).join(', ')
    : 'No specific files identified yet';
  const failingTests = failedTests.length > 0 ? failedTests.slice(0, 5).join(', ') : 'Unknown failing test names';

  return [
    originalPrompt,
    `You are in a managed test-fix loop. Attempt ${attempt}.`,
    `The runtime already ran the project tests with: ${testCommand}`,
    summary,
    `Likely affected files: ${likelyFiles}`,
    `Failing tests: ${failingTests}`,
    `Suggested strategy: ${strategy}`,
    'Inspect the failing tests and source files, apply the smallest viable fix, and then stop. The runtime will rerun the tests after your changes.',
  ].join('\n\n');
};

const buildFinalMessage = ({
  attemptsUsed,
  changedFiles,
  finalSummary,
  success,
  testCommand,
}: {
  attemptsUsed: number;
  changedFiles: string[];
  finalSummary: string;
  success: boolean;
  testCommand: string;
}): string => {
  const statusLine = success
    ? `Managed test-fix loop completed successfully after ${attemptsUsed} attempt${attemptsUsed === 1 ? '' : 's'}.`
    : `Managed test-fix loop stopped after ${attemptsUsed} attempt${attemptsUsed === 1 ? '' : 's'} with tests still failing.`;

  return [
    statusLine,
    `Test command: ${testCommand}`,
    `Files changed: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'none'}`,
    '',
    finalSummary,
  ].join('\n');
};

export const runManagedTestFixLoop = async ({
  eventBus,
  initialMessages,
  maxFixAttempts,
  model,
  planningMessage,
  prompt,
  provider,
  relevantFiles,
  signal,
  systemPrompt,
  taskState,
  testCommand,
  tokenLedger,
  toolContext,
  toolRegistry,
}: TestFixRuntimeOptions): Promise<AgentRunResult> => {
  const messages = [...initialMessages];
  const toolCalls: ToolCallRecord[] = [];
  const explicitTestCommand = testCommand && /^(npm|pnpm|yarn|bun)\b/u.test(testCommand.trim())
    ? testCommand.trim()
    : null;
  const resolvedTestCommand = explicitTestCommand ?? 'detected project tests';
  let lastUsage: ProviderUsage | undefined;
  let attemptsUsed = 0;
  let lastSummary = 'No test output captured.';

  for (let attempt = 1; attempt <= maxFixAttempts; attempt += 1) {
    attemptsUsed = attempt;
    const testRunResult = await invokeToolWithTracking({
      eventBus,
      input: explicitTestCommand ? {command: explicitTestCommand} : {},
      messages,
      taskState,
      toolCalls,
      toolContext,
      toolName: 'test_runner',
      toolRegistry,
    });

    const context = createTestFixContext(testRunResult.output, maxFixAttempts);
    const testResult = context.getResult();
    lastSummary = context.getSummary();
    if (!testRunResult.ok && context.isSuccess()) {
      lastSummary = [
        '## Test Results',
        '',
        `**Status:** ${testRunResult.summary}`,
        '',
        testRunResult.output,
      ].join('\n');
    }

    if (testRunResult.ok && context.isSuccess()) {
      const finalMessage: ChatMessage = {
        content: buildFinalMessage({
          attemptsUsed: attempt - 1,
          changedFiles: taskState?.filesChanged ?? [],
          finalSummary: lastSummary,
          success: true,
          testCommand: resolvedTestCommand,
        }),
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID(),
        role: 'assistant',
      };
      messages.push(finalMessage);
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
        usage: lastUsage,
      };
    }

    const attemptRelevantFiles = prioritizeRelevantFiles(Array.from(new Set([
      ...context.getAffectedFiles(),
      ...relevantFiles,
    ])).filter(Boolean));

    const attemptResult = await runAgentLoop({
      eventBus,
      initialMessages: messages,
      maxConsecutiveErrors: 2,
      model,
      planningMessage: attempt === 1 ? planningMessage : null,
      provider,
      signal,
      systemPrompt,
      taskState,
      tokenLedger,
      toolContext,
      toolRegistry,
      userPrompt: buildAttemptPrompt({
        attempt,
        failedTests: testResult.failedTests,
        originalPrompt: prompt,
        relevantFiles: attemptRelevantFiles,
        strategy: context.getStrategy(),
        summary: lastSummary,
        testCommand: resolvedTestCommand,
      }),
    });

    lastUsage = attemptResult.usage;
    messages.splice(0, messages.length, ...attemptResult.messages);
    toolCalls.push(...attemptResult.toolCalls);

    const changedThisAttempt = attemptResult.toolCalls.some((toolCall) => EDIT_TOOL_NAMES.has(toolCall.toolName));
    if (!changedThisAttempt) {
      break;
    }
  }

  const finalMessage: ChatMessage = {
    content: buildFinalMessage({
      attemptsUsed,
      changedFiles: taskState?.filesChanged ?? [],
      finalSummary: lastSummary,
      success: false,
      testCommand: resolvedTestCommand,
    }),
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
  messages.push(finalMessage);
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
    usage: lastUsage,
  };
};
