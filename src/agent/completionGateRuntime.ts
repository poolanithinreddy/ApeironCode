import {
  evaluateCompletionGates,
  formatCompletionGateFeedback,
  type CompletionGateContext,
  type CompletionGateResult,
} from './completionGates.js';
import type {ToolCallRecord} from './types.js';

const TEST_TOOLS = new Set(['test_runner']);
const BUILD_TOOLS = new Set(['build_runner']);
const VERIFY_TOOLS = new Set(['test_runner', 'build_runner', 'lint_runner']);

const stringField = (input: Record<string, unknown>, key: string): string => {
  const v = input[key];
  return typeof v === 'string' ? v : '';
};

/**
 * Derive a lightweight run-state snapshot from a list of recorded tool calls.
 * This avoids forcing every loop integration to thread state manually.
 */
export const deriveRunStateFromToolCalls = (
  toolCalls: ToolCallRecord[],
  userPrompt: string,
): CompletionGateRunState => {
  const filesChanged: string[] = [];
  const toolsExecuted: string[] = [];
  const toolFailures: string[] = [];
  const changedTextChunks: string[] = [];
  let rollbackOccurred = false;
  let testsRan = false;
  let buildRan = false;
  let verificationRan = false;

  for (const call of toolCalls) {
    toolsExecuted.push(call.toolName);
    if (call.status === 'error') {
      toolFailures.push(call.toolName);
    }
    if (TEST_TOOLS.has(call.toolName) && call.status === 'success') testsRan = true;
    if (BUILD_TOOLS.has(call.toolName) && call.status === 'success') buildRan = true;
    if (VERIFY_TOOLS.has(call.toolName)) verificationRan = true;

    const path = stringField(call.input, 'path');
    if (path && (call.toolName === 'edit_file' || call.toolName === 'patch_file' || call.toolName === 'write_file')) {
      filesChanged.push(path);
      const content = stringField(call.input, 'content') || stringField(call.input, 'patch') || stringField(call.input, 'newText');
      if (content) changedTextChunks.push(content);
      const summary = call.result?.summary;
      if (typeof summary === 'string') changedTextChunks.push(summary);
    }
    if (call.toolName === 'revert_patch') rollbackOccurred = true;
    const meta = call.result?.metadata;
    if (meta && typeof meta === 'object' && 'rollback' in meta && meta.rollback === true) {
      rollbackOccurred = true;
    }
  }

  return {
    filesChanged,
    toolsExecuted,
    toolFailures,
    rollbackOccurred,
    userPrompt,
    verificationRan,
    buildRan,
    testsRan,
    changedTextSummary: changedTextChunks.length > 0 ? changedTextChunks.join('\n') : undefined,
  };
};

export interface CompletionGateRunState {
  filesChanged: string[];
  toolsExecuted: string[];
  toolFailures: string[];
  rollbackOccurred: boolean;
  userPrompt: string;
  verificationRan: boolean;
  buildRan: boolean;
  testsRan: boolean;
  todoMarkersIntroduced?: boolean;
  changedTextSummary?: string;
}

/**
 * Translate a runtime-collected run state into a CompletionGateContext.
 * The gates module stays pure; this adapter handles user-prompt heuristics
 * (e.g. detecting whether the user explicitly asked for tests).
 */
export const buildCompletionGateContextFromRun = (
  runState: CompletionGateRunState,
): CompletionGateContext => {
  const userAskedForTests = /\btest(s|ing)?\b/i.test(runState.userPrompt);
  return {
    filesChanged: runState.filesChanged,
    toolsExecuted: runState.toolsExecuted,
    toolFailures: runState.toolFailures,
    rollbackOccurred: runState.rollbackOccurred,
    userAskedForTests,
    todoMarkersIntroduced: runState.todoMarkersIntroduced ?? false,
    verificationRan: runState.verificationRan,
    buildRan: runState.buildRan,
    testsRan: runState.testsRan,
    changedTextSummary: runState.changedTextSummary,
  };
};

export const applyCompletionGateFeedback = (
  finalMessage: string,
  gateResult: CompletionGateResult,
): string => {
  const feedback = formatCompletionGateFeedback(gateResult);
  if (!feedback) return finalMessage;
  return `${finalMessage}\n\n${feedback}`;
};

export const shouldBlockCompletion = (gateResult: CompletionGateResult): boolean => {
  return !gateResult.passed && gateResult.gates.some((g) => !g.passed && g.severity === 'block');
};

export const evaluateRunCompletionGates = (
  runState: CompletionGateRunState,
): CompletionGateResult => {
  return evaluateCompletionGates(buildCompletionGateContextFromRun(runState));
};
