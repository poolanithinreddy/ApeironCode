/**
 * Agent task execution adapter (Phase 16D.1).
 *
 * Provides a clean, injectable AgentRunner interface so that:
 * - Agent tasks run through the live ApeironCode Agent loop when available.
 * - Tests can inject a mock runner without real providers.
 * - Worktree tasks use worktreePath as cwd.
 * - Prompt is assembled from task.prompt + markdown agent body (if resolved).
 * - No ToolRegistry bypass. No provider.chat(). No XML directives.
 */

import {redactSecrets} from '../share/redactor.js';
import type {BgTask} from './bgTask.js';
import type {AgentMode} from '../agent/types.js';
import type {ResolvedConfig} from '../config/config.js';
import type {ProviderRegistry} from '../providers/registry.js';
import type {ToolRegistry} from '../tools/registry.js';

export interface AgentTaskRunOptions {
  /** Working directory for the agent run (may be worktreePath for worktree tasks). */
  cwd: string;
  /** Agent mode (edit, review, fix, etc.) */
  mode?: AgentMode;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Optional resolved markdown agent body to prepend. */
  agentBody?: string;
}

export interface AgentTaskRunResult {
  success: boolean;
  outputSummary: string;
  errorSummary?: string;
  toolCallCount?: number;
  finalMessage?: string;
  sessionId?: string;
}

/**
 * Injectable AgentRunner — real implementation uses Agent.run(),
 * test implementation returns a stub result.
 */
export type AgentRunner = (prompt: string, options: AgentTaskRunOptions) => Promise<AgentTaskRunResult>;

/**
 * Build the effective prompt for an agent task.
 * If the task has a resolved markdown agent body, prepend it as context.
 */
export const buildAgentTaskPrompt = (task: BgTask, agentBody?: string): string => {
  const userPrompt = task.prompt ?? task.title;
  if (!agentBody) return userPrompt;

  return [
    '--- Agent Instructions ---',
    agentBody.trim(),
    '',
    '--- Task ---',
    userPrompt,
  ].join('\n');
};

/**
 * Build AgentTaskRunOptions from a BgTask.
 * Worktree tasks use worktreePath as cwd.
 */
export const buildAgentTaskOptions = (task: BgTask, overrides?: Partial<AgentTaskRunOptions>): AgentTaskRunOptions => ({
  cwd: task.worktreePath ?? task.cwd,
  mode: resolveAgentMode(task),
  ...overrides,
});

const resolveAgentMode = (task: BgTask): AgentMode => {
  switch (task.kind) {
    case 'review': return 'review';
    case 'test-fix': return 'test-fix';
    default: return 'edit';
  }
};

/**
 * Run an agent task through the injected runner.
 * Captures safe summaries; redacts secrets in all output.
 */
export const runAgentTask = async (
  task: BgTask,
  runner: AgentRunner,
  overrides?: Partial<AgentTaskRunOptions>,
): Promise<AgentTaskRunResult> => {
  const prompt = buildAgentTaskPrompt(task, overrides?.agentBody);
  const options = buildAgentTaskOptions(task, overrides);

  try {
    const result = await runner(redactSecrets(prompt), options);
    return {
      ...result,
      outputSummary: redactSecrets(result.outputSummary.slice(0, 1_000)),
      errorSummary: result.errorSummary ? redactSecrets(result.errorSummary.slice(0, 500)) : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      outputSummary: '',
      errorSummary: redactSecrets(msg.slice(0, 500)),
    };
  }
};

/**
 * Summarise an AgentTaskRunResult for task logging.
 */
export const summarizeAgentTaskResult = (result: AgentTaskRunResult): string => {
  const lines: string[] = [];
  lines.push(result.success ? 'Agent task completed successfully.' : 'Agent task failed.');
  if (result.outputSummary) lines.push(`Output: ${result.outputSummary}`);
  if (result.errorSummary) lines.push(`Error: ${result.errorSummary}`);
  if (result.toolCallCount != null) lines.push(`Tool calls: ${result.toolCallCount}`);
  if (result.sessionId) lines.push(`Session: ${result.sessionId}`);
  return lines.join('\n');
};

/**
 * Format a run result into a concise log line.
 * Redacts secrets.
 */
export const formatAgentTaskRunLog = (result: AgentTaskRunResult): string =>
  redactSecrets(summarizeAgentTaskResult(result));

/**
 * Create a real AgentRunner factory.
 * Lazily imports shared Agent infrastructure to avoid hard coupling.
 * The caller must provide a config and registries — see bgTaskHandlers.ts.
 */
export type RealAgentRunnerFactory = () => Promise<AgentRunner>;

/**
 * Build a real AgentRunner using the live Agent.run() path.
 * Requires config, providerRegistry, and toolRegistry injected at runtime.
 */
export const buildRealAgentRunner = (deps: {
  getConfig: () => Promise<ResolvedConfig>;
  getProviderRegistry: () => Promise<ProviderRegistry>;
  getToolRegistry: () => Promise<ToolRegistry>;
}): AgentRunner => {
  return async (prompt: string, options: AgentTaskRunOptions): Promise<AgentTaskRunResult> => {
    const {Agent} = await import('../agent/Agent.js');
    const config = await deps.getConfig();
    const providerRegistry = await deps.getProviderRegistry();
    const toolRegistry = await deps.getToolRegistry();

    const agent = new Agent({config, cwd: options.cwd, providerRegistry, toolRegistry});
    const result = await agent.run({
      mode: options.mode ?? 'edit',
      prompt,
      signal: options.signal,
    });

    const finalText = result.finalMessage?.content ?? '';
    const textContent = Array.isArray(finalText)
      ? finalText.map((c) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as {text: unknown}).text) : '')).join('')
      : String(finalText);

    return {
      success: true,
      outputSummary: redactSecrets(textContent.slice(0, 1_000)),
      toolCallCount: result.toolCalls.length,
      sessionId: result.messages[0] ? undefined : undefined,
    };
  };
};
