import {randomUUID} from 'node:crypto';

import type {Agent} from '../agent/Agent.js';

import {createEvalWorkspace, listChangedFiles, snapshotWorkspaceFiles} from './workspace.js';
import {getEvalSuite, suites} from './suites/index.js';
import {saveEvalResult} from './results.js';
import {createDeterministicEvalAgent} from './harness.js';
import {estimateObjectTokens, estimateTokens} from '../tokens/estimate.js';
import {trace} from '../utils/trace.js';
import type {
  EvalAgentAdapter,
  EvalAgentRunResult,
  EvalCase,
  EvalReport,
  EvalResult,
  EvalRunSummary,
  EvalSuite,
  TokenEfficiencyMetrics,
} from './types.js';

const emptyMetrics = (): TokenEfficiencyMetrics => ({
  estimatedContextTokens: 0,
  estimatedInputTokens: 0,
  estimatedMemoryTokens: 0,
  estimatedOutputTokens: 0,
  estimatedToolResultTokens: 0,
  estimatedToolSchemaTokens: 0,
  successPer1kTokens: 0,
  toolCallsPer1kTokens: 0,
  totalEstimatedTokens: 0,
});

const calculateMetrics = (
  evalCase: EvalCase,
  agentResult: EvalAgentRunResult,
  passed: boolean,
): TokenEfficiencyMetrics => {
  const toolResultTokens = (agentResult.toolCalls ?? []).reduce((sum, toolCall) =>
    sum + estimateObjectTokens(toolCall.result ?? toolCall.error ?? ''), 0);
  const metrics = {
    compressionRatio: agentResult.compressionRatio,
    estimatedContextTokens: estimateTokens(agentResult.contextText ?? ''),
    estimatedInputTokens: estimateTokens(evalCase.prompt),
    estimatedMemoryTokens: estimateTokens(agentResult.memoryText ?? ''),
    estimatedOutputTokens: estimateTokens(agentResult.finalOutput ?? ''),
    estimatedToolResultTokens: toolResultTokens,
    estimatedToolSchemaTokens: estimateTokens(agentResult.toolSchemaText ?? (evalCase.expectedTools ?? []).join('\n')),
    successPer1kTokens: 0,
    toolCallsPer1kTokens: 0,
    totalEstimatedTokens: 0,
  };
  metrics.totalEstimatedTokens = metrics.estimatedInputTokens + metrics.estimatedContextTokens +
    metrics.estimatedMemoryTokens + metrics.estimatedOutputTokens + metrics.estimatedToolResultTokens +
    metrics.estimatedToolSchemaTokens;
  metrics.successPer1kTokens = metrics.totalEstimatedTokens > 0 && passed
    ? Number((1000 / metrics.totalEstimatedTokens).toFixed(3))
    : 0;
  metrics.toolCallsPer1kTokens = metrics.totalEstimatedTokens > 0
    ? Number((((agentResult.toolCalls?.length ?? 0) / metrics.totalEstimatedTokens) * 1000).toFixed(3))
    : 0;
  return metrics;
};

const summarizeMetrics = (results: EvalResult[]): TokenEfficiencyMetrics => {
  const total = results.reduce((sum, result) => sum + result.tokenEfficiency.totalEstimatedTokens, 0);
  const toolCalls = results.reduce((sum, result) => sum + result.toolCalls.length, 0);
  const passed = results.filter((result) => result.passed).length;
  return {
    compressionRatio: results.length > 0
      ? Number((results.reduce((sum, result) => sum + (result.tokenEfficiency.compressionRatio ?? 1), 0) / results.length).toFixed(3))
      : undefined,
    estimatedContextTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedContextTokens, 0),
    estimatedInputTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedInputTokens, 0),
    estimatedMemoryTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedMemoryTokens, 0),
    estimatedOutputTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedOutputTokens, 0),
    estimatedToolResultTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedToolResultTokens, 0),
    estimatedToolSchemaTokens: results.reduce((sum, result) => sum + result.tokenEfficiency.estimatedToolSchemaTokens, 0),
    successPer1kTokens: total > 0 ? Number(((passed / total) * 1000).toFixed(3)) : 0,
    toolCallsPer1kTokens: total > 0 ? Number(((toolCalls / total) * 1000).toFixed(3)) : 0,
    totalEstimatedTokens: total,
  };
};

const isEvalAdapter = (agent: Agent | EvalAgentAdapter): agent is EvalAgentAdapter =>
  typeof (agent as EvalAgentAdapter).runEval === 'function';

const runAgent = async (
  evalCase: EvalCase,
  agent: Agent | EvalAgentAdapter,
  workspace: Awaited<ReturnType<typeof createEvalWorkspace>>,
): Promise<EvalAgentRunResult> => {
  if (isEvalAdapter(agent)) {
    return agent.runEval(evalCase, workspace, {
      maxIterations: evalCase.maxIterations,
      timeoutMs: evalCase.timeoutMs,
    });
  }

  const result = await agent.run({
    mode: evalCase.mode,
    prompt: evalCase.prompt,
    signal: undefined,
  });
  return {
    filesChanged: result.taskState?.filesChanged,
    iterations: undefined,
    tokenUsage: result.usage,
    toolCalls: result.toolCalls,
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs?: number): Promise<T> => {
  if (!timeoutMs) {
    return promise;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

/* eslint-disable no-redeclare */
export async function runEval(cwd: string, id: string): Promise<EvalReport>;
export async function runEval(evalCase: EvalCase, agent: Agent | EvalAgentAdapter): Promise<EvalResult>;
export async function runEval(
  evalCaseOrCwd: EvalCase | string,
  agentOrId: Agent | EvalAgentAdapter | string,
): Promise<EvalResult | EvalReport> {
  if (typeof evalCaseOrCwd === 'string') {
    return runLegacyEval(evalCaseOrCwd, typeof agentOrId === 'string' ? agentOrId : 'smoke');
  }
  const evalCase = evalCaseOrCwd;
  const agent = agentOrId as Agent | EvalAgentAdapter;
  return runEvalCase(evalCase, agent);
}

/* eslint-enable no-redeclare */

const runEvalCaseInner = async (
  evalCase: EvalCase,
  agent: Agent | EvalAgentAdapter,
): Promise<EvalResult> => {
  const started = Date.now();
  let workspace: Awaited<ReturnType<typeof createEvalWorkspace>> | undefined;
  let initialFiles = new Map<string, string>();
  const failures: string[] = [];
  let agentResult: EvalAgentRunResult = {};

  try {
    workspace = evalCase.setup ? await evalCase.setup() : await createEvalWorkspace();
    initialFiles = await snapshotWorkspaceFiles(workspace);
    agentResult = await withTimeout(runAgent(evalCase, agent, workspace), evalCase.timeoutMs);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  let filesChanged = agentResult.filesChanged ?? [];
  if (workspace) {
    filesChanged = Array.from(new Set([...filesChanged, ...(await listChangedFiles(workspace, initialFiles))])).sort();
  }

  const result: EvalResult = {
    durationMs: Date.now() - started,
    failures,
    filesChanged,
    id: evalCase.id,
    iterations: agentResult.iterations,
    passed: failures.length === 0,
    tags: evalCase.tags,
    tokenUsage: agentResult.tokenUsage,
    tokenEfficiency: emptyMetrics(),
    toolCalls: agentResult.toolCalls ?? [],
  };
  result.tokenEfficiency = calculateMetrics(evalCase, agentResult, true);

  if (workspace && failures.length === 0) {
    for (const evalAssertion of evalCase.assertions) {
      try {
        result.failures.push(...await evalAssertion.run({initialFiles, result, workspace}));
      } catch (error) {
        result.failures.push(`${evalAssertion.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  result.passed = result.failures.length === 0;
  result.tokenEfficiency = calculateMetrics(evalCase, agentResult, result.passed);

  if (workspace) {
    try {
      await workspace.cleanup();
    } catch (error) {
      result.failures.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      result.passed = false;
    }
  }

  return result;
};

export const runEvalCase = async (
  evalCase: EvalCase,
  agent: Agent | EvalAgentAdapter,
): Promise<EvalResult> => trace('eval.run', () => runEvalCaseInner(evalCase, agent), {evalId: evalCase.id});

export const runSuite = async (
  suite: EvalSuite,
  agent: Agent | EvalAgentAdapter = createDeterministicEvalAgent(),
): Promise<EvalRunSummary> => {
  const started = Date.now();
  const results: EvalResult[] = [];
  for (const evalCase of suite.cases) {
    results.push(await runEvalCase(evalCase, agent));
  }
  const passed = results.filter((result) => result.passed).length;
  return {
    durationMs: Date.now() - started,
    failed: results.length - passed,
    passed,
    results,
    suiteId: suite.id,
    timestamp: new Date().toISOString(),
    tokenEfficiency: summarizeMetrics(results),
    total: results.length,
  };
};

export const runSuiteById = async (
  suiteId: string,
  agent: Agent | EvalAgentAdapter = createDeterministicEvalAgent(),
): Promise<EvalRunSummary> => {
  const suite = getEvalSuite(suiteId);
  if (!suite) {
    return {
      durationMs: 0,
      failed: 1,
      passed: 0,
      results: [{
        durationMs: 0,
        failures: [`Unknown evaluation suite: ${suiteId}`],
        filesChanged: [],
        id: suiteId,
        passed: false,
        tokenEfficiency: emptyMetrics(),
        toolCalls: [],
      }],
      suiteId,
      timestamp: new Date().toISOString(),
      tokenEfficiency: emptyMetrics(),
      total: 1,
    };
  }
  const summary = await runSuite(suite, agent);
  await saveEvalResult(summary);
  return summary;
};

export const runAllSuites = async (
  agent: Agent | EvalAgentAdapter = createDeterministicEvalAgent(),
): Promise<EvalRunSummary[]> => {
  const summaries: EvalRunSummary[] = [];
  for (const suite of suites) {
    const summary = await runSuite(suite, agent);
    await saveEvalResult(summary);
    summaries.push(summary);
  }
  return summaries;
};

export const runLegacyEval = async (cwd: string, id: string): Promise<EvalReport> => {
  void cwd;
  const summary = await runSuiteById(id);
  return {
    createdAt: summary.timestamp ?? new Date().toISOString(),
    results: summary.results.map((result) => ({
      details: result.failures.length > 0 ? result.failures : [`${result.filesChanged.length} file(s) changed`],
      id: result.id,
      status: result.passed ? 'pass' : 'fail',
    })),
    runId: `${id}-${randomUUID()}`,
  };
};

export const loadLatestEvalReport = async (cwd: string): Promise<EvalRunSummary | null> => {
  void cwd;
  const {loadLastEvalResult} = await import('./results.js');
  return loadLastEvalResult('smoke');
};
