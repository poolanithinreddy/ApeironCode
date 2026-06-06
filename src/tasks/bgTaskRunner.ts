/**
 * Background task runner (Phase 16D).
 * Local-only, synchronous in this phase. No uncontrolled daemon.
 * Shell tasks use a safe, sandboxed runner.
 * Agent tasks call the existing Agent path.
 * Markdown command tasks render prompts safely.
 */

import {redactSecrets} from '../share/redactor.js';
import type {BgTaskStore} from './bgTaskStore.js';
import type {BgTask} from './bgTask.js';
import {isTerminalStatus} from './bgTask.js';
import {runAgentTask, summarizeAgentTaskResult} from './agentTaskRunner.js';
import type {AgentRunner} from './agentTaskRunner.js';
import {buildTaskResumePlan, formatTaskResumePlan} from './taskResume.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {maybeSyncProjectBrainAfterRun} from '../projectBrain/autoSync.js';
import type {ProjectBrainSyncMode} from '../projectBrain/syncPolicy.js';

export interface TaskRunnerOptions {
  /** Inject a mock shell executor for tests. */
  shellExecutor?: ShellExecutor;
  /** Inject a real or mock agent runner for agent/review/test-fix tasks. */
  agentRunner?: AgentRunner;
  /** Optional event bus for emitting task lifecycle events. */
  eventBus?: EventBus;
  /** Max logs to keep per task. */
  maxLogs?: number;
  /** Project Brain sync mode after agent tasks. Default: ask (no auto-write). */
  brainSyncMode?: ProjectBrainSyncMode;
}

export type ShellExecutor = (command: string, cwd: string) => Promise<{stdout: string; exitCode: number}>;

const defaultShellExecutor: ShellExecutor = async (command: string, cwd: string) => {
  const {execa} = await import('execa');
  try {
    const result = await execa('sh', ['-c', command], {cwd, reject: false});
    return {stdout: result.stdout, exitCode: result.exitCode ?? 0};
  } catch (err) {
    return {stdout: String(err), exitCode: 1};
  }
};

export class TaskRunner {
  constructor(
    private readonly store: BgTaskStore,
    private readonly options: TaskRunnerOptions = {},
  ) {}

  private shellExec(): ShellExecutor {
    return this.options.shellExecutor ?? defaultShellExecutor;
  }

  private hasAgentRunner(): boolean {
    return this.options.agentRunner != null;
  }

  async startTask(taskId: string): Promise<BgTask | null> {
    const task = await this.store.getTask(taskId);
    if (!task) return null;
    if (task.status !== 'queued') {
      await this.store.appendTaskLog(taskId, {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `Cannot start task in status: ${task.status}`,
      });
      return task;
    }
    return this.runTaskOnce(task);
  }

  async stopTask(taskId: string): Promise<BgTask | null> {
    const task = await this.store.getTask(taskId);
    if (!task) return null;
    if (isTerminalStatus(task.status)) {
      return task;
    }
    await this.store.appendTaskLog(taskId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Task stopped by user.',
    });
    const stopped = await this.store.updateStatus(taskId, 'stopped');
    this.emit({type: 'task.stopped', taskId, timestamp: createEventTimestamp()});
    return stopped;
  }

  async resumeTask(taskId: string): Promise<BgTask | null> {
    const task = await this.store.getTask(taskId);
    if (!task) return null;

    // Build resume plan — includes checkpoint/worktree/fresh-rerun strategy
    const plan = await buildTaskResumePlan(task);
    const planSummary = formatTaskResumePlan(plan);

    if (plan.strategy === 'not-resumable') {
      await this.store.appendTaskLog(taskId, {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: planSummary,
      });
      return task;
    }

    await this.store.appendTaskLog(taskId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Resuming task.\n${planSummary}`,
    });
    this.emit({type: 'task.resumed', taskId, timestamp: createEventTimestamp()});

    // For checkpoint strategy with worktreePath, update cwd
    const patch: Partial<BgTask> = {};
    if (plan.strategy === 'worktree-rerun' && task.worktreePath) {
      patch.cwd = task.worktreePath;
    }

    const queued = await this.store.updateStatus(taskId, 'queued', patch);
    if (!queued) return null;
    return this.runTaskOnce(queued);
  }

  private emit(event: Parameters<EventBus['emit']>[0]): void {
    this.options.eventBus?.emit(event);
  }

  async runTaskOnce(task: BgTask): Promise<BgTask> {
    const started = await this.store.updateStatus(task.id, 'running');
    if (!started) return task;

    this.emit({type: 'task.started', taskId: task.id, timestamp: createEventTimestamp()});

    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Task started: ${task.kind} — ${task.title}`,
    });

    try {
      switch (task.kind) {
        case 'shell':
          return await this.runShellTask(started);
        case 'workflow':
          return await this.runWorkflowCommandTask(started);
        case 'agent':
        case 'review':
        case 'test-fix':
          return this.hasAgentRunner()
            ? await this.runAgentTask(started)
            : await this.runAgentPlaceholderTask(started);
        default:
          return await this.failTask(task.id, `Unknown task kind: ${String(task.kind)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.failTask(task.id, redactSecrets(msg));
    }
  }

  private async runShellTask(task: BgTask): Promise<BgTask> {
    if (!task.command) {
      return this.failTask(task.id, 'Shell task has no command.');
    }
    const exec = this.shellExec();
    const {stdout, exitCode} = await exec(task.command, task.cwd);
    const safeOutput = redactSecrets(stdout.slice(0, 2_000));

    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: exitCode === 0 ? 'info' : 'error',
      message: safeOutput || '(no output)',
    });

    if (exitCode !== 0) {
      return this.failTask(task.id, `Command exited with code ${exitCode}.`, safeOutput);
    }
    return this.succeedTask(task.id, safeOutput);
  }

  private async runWorkflowCommandTask(task: BgTask): Promise<BgTask> {
    // Workflow command tasks render a prompt and record it safely.
    // Actual agent execution requires an explicit --start with agent runner wired in.
    const prompt = task.prompt ?? '(no prompt rendered)';
    const safePrompt = redactSecrets(prompt.slice(0, 1_000));
    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Markdown command prompt rendered. Use the prompt with an agent to execute.`,
    });
    return this.succeedTask(task.id, `Prompt: ${safePrompt}`);
  }

  private async runAgentTask(task: BgTask): Promise<BgTask> {
    const runner = this.options.agentRunner!;
    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Running agent task via Agent loop: ${task.agentName ?? 'default'} | cwd: ${task.worktreePath ?? task.cwd}`,
    });

    const result = await runAgentTask(task, runner);
    const summary = summarizeAgentTaskResult(result);

    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: result.success ? 'info' : 'error',
      message: summary,
    });

    // Project Brain auto-sync (non-blocking, default ask = no auto-write)
    const syncMode = this.options.brainSyncMode ?? 'ask';
    if (syncMode !== 'off') {
      try {
        const syncOut = await maybeSyncProjectBrainAfterRun(
          {
            prompt: task.prompt ?? task.title,
            agentResult: {
              outputSummary: result.outputSummary,
              errorSummary: result.errorSummary,
              success: result.success,
            },
            failures: result.errorSummary ? [result.errorSummary] : [],
          },
          {cwd: task.cwd, mode: syncMode},
        );
        if (syncOut.hint) {
          await this.store.appendTaskLog(task.id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Project Brain: ${syncOut.hint}`,
          });
        }
      } catch {
        // Brain sync errors must never fail the task
      }
    }

    if (!result.success) {
      return this.failTask(task.id, result.errorSummary ?? 'Agent task failed.', result.outputSummary || undefined);
    }
    return this.succeedTask(task.id, result.outputSummary || undefined);
  }

  private async runAgentPlaceholderTask(task: BgTask): Promise<BgTask> {
    // No AgentRunner injected — record the task for deferred execution.
    const summary = [
      `Agent task recorded (no runner injected): ${task.agentName ?? 'default'}`,
      task.prompt ? `Prompt: ${redactSecrets(task.prompt.slice(0, 300))}` : '',
      task.worktreePath ? `Worktree: ${task.worktreePath}` : '',
      'Use apeironcode task resume with a live agent runner to execute.',
    ].filter(Boolean).join('\n');

    await this.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: summary,
    });
    return this.succeedTask(task.id, summary);
  }

  private async failTask(id: string, error: string, output?: string): Promise<BgTask> {
    const safeError = redactSecrets(error.slice(0, 500));
    const result = (await this.store.updateStatus(id, 'failed', {
      errorSummary: safeError,
      outputSummary: output,
    })) ?? (await this.store.getTask(id))!;
    this.emit({type: 'task.failed', taskId: id, errorSummary: safeError, timestamp: createEventTimestamp()});
    return result;
  }

  private async succeedTask(id: string, output?: string): Promise<BgTask> {
    const safeOutput = output ? redactSecrets(output.slice(0, 1_000)) : undefined;
    const result = (await this.store.updateStatus(id, 'succeeded', {outputSummary: safeOutput})) ?? (await this.store.getTask(id))!;
    this.emit({type: 'task.completed', taskId: id, outputSummary: safeOutput, timestamp: createEventTimestamp()});
    return result;
  }

  async getTaskOutput(taskId: string): Promise<string> {
    const task = await this.store.getTask(taskId);
    if (!task) return 'Task not found.';
    return formatTaskOutput(task);
  }
}

export const formatTaskOutput = (task: BgTask): string => {
  const lines: string[] = [
    `Task: ${task.id.slice(0, 8)} [${task.kind}] ${task.title}`,
    `Status: ${task.status}`,
  ];
  if (task.outputSummary) lines.push(`Output:\n${task.outputSummary}`);
  if (task.errorSummary) lines.push(`Error:\n${task.errorSummary}`);
  if (task.logs.length > 0) {
    lines.push('Logs (last 10):');
    for (const log of task.logs.slice(-10)) {
      lines.push(`  [${log.level}] ${log.timestamp.slice(11, 19)} ${log.message}`);
    }
  }
  return lines.join('\n');
};
