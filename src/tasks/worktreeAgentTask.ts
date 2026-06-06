/**
 * Worktree-isolated agent task (Phase 16D).
 * Creates an agent worktree, updates the task CWD, and runs the agent
 * in the worktree. Failure keeps the worktree for inspection.
 * Cleanup is always explicit — never automatic.
 */

import type {BgTaskStore} from './bgTaskStore.js';
import {createAgentWorktree} from '../agents/worktreeManager.js';
import type {GitRunner} from '../agents/worktreeManager.js';
import type {BgTask} from './bgTask.js';
import type {CreateBgTaskInput} from './bgTaskStore.js';
import {runAgentTask, summarizeAgentTaskResult} from './agentTaskRunner.js';
import type {AgentRunner} from './agentTaskRunner.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';

export interface CreateWorktreeAgentTaskInput extends CreateBgTaskInput {
  isolation: 'worktree';
  purpose: string;
  baseBranch?: string;
}

export interface WorktreeAgentTaskOptions {
  store: BgTaskStore;
  /** Injected git runner for tests. */
  runGit?: GitRunner;
  /** Override repo root for tests (skips getGitRepoRoot). */
  repoRootOverride?: string;
  /** Live agent runner — if provided, the agent loop runs in the worktree. */
  agentRunner?: AgentRunner;
  /** Optional event bus for lifecycle events. */
  eventBus?: EventBus;
}

export const createWorktreeAgentTask = async (
  input: CreateWorktreeAgentTaskInput,
  options: WorktreeAgentTaskOptions,
): Promise<BgTask> => {
  const task = await options.store.createTask({
    ...input,
    isolation: 'worktree',
  });

  await options.store.appendTaskLog(task.id, {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Worktree agent task created. Worktree will be provisioned on start.`,
  });

  return task;
};

export const runWorktreeAgentTask = async (
  taskId: string,
  options: WorktreeAgentTaskOptions,
): Promise<BgTask> => {
  const task = await options.store.getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  if (task.isolation !== 'worktree') {
    throw new Error(`Task ${taskId} is not a worktree task.`);
  }

  await options.store.updateStatus(task.id, 'running');
  await options.store.appendTaskLog(task.id, {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Provisioning worktree for task: ${task.title}`,
  });

  let worktree;
  try {
    worktree = await createAgentWorktree({
      cwd: task.cwd,
      purpose: task.title,
      taskId: task.id,
      runGit: options.runGit,
      repoRootOverride: options.repoRootOverride,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await options.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Worktree creation failed: ${msg}`,
    });
    return (await options.store.updateStatus(task.id, 'failed', {errorSummary: msg})) ?? task;
  }

  // Update task with worktree information
  const updated = await options.store.updateTask(task.id, {
    worktreePath: worktree.worktreePath,
    branchName: worktree.branchName,
    parentBranch: worktree.baseBranch,
  });

  await options.store.appendTaskLog(task.id, {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Worktree ready: ${worktree.worktreePath} (branch: ${worktree.branchName})`,
  });
  options.eventBus?.emit({
    type: 'worktree.created',
    worktreeId: worktree.id,
    branchName: worktree.branchName,
    taskId: task.id,
    timestamp: createEventTimestamp(),
  });

  const taskWithWorktree = updated ?? task;

  // If an AgentRunner is provided, run the task through the live Agent loop.
  if (options.agentRunner) {
    await options.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting agent loop in worktree: ${worktree.worktreePath}`,
    });

    const runResult = await runAgentTask(taskWithWorktree, options.agentRunner, {
      cwd: worktree.worktreePath,
    });
    const runSummary = summarizeAgentTaskResult(runResult);

    await options.store.appendTaskLog(task.id, {
      timestamp: new Date().toISOString(),
      level: runResult.success ? 'info' : 'error',
      message: runSummary,
    });

    const fullSummary = summarizeWorktreeTaskResult(
      taskWithWorktree,
      worktree.worktreePath,
      worktree.branchName,
      runResult.outputSummary,
    );

    if (!runResult.success) {
      // Failure: keep worktree for inspection
      return (await options.store.updateStatus(task.id, 'failed', {
        errorSummary: runResult.errorSummary,
        outputSummary: fullSummary,
      })) ?? taskWithWorktree;
    }
    return (await options.store.updateStatus(task.id, 'succeeded', {outputSummary: fullSummary})) ?? taskWithWorktree;
  }

  // No agent runner — record worktree location for deferred execution.
  const summary = summarizeWorktreeTaskResult(taskWithWorktree, worktree.worktreePath, worktree.branchName);
  return (await options.store.updateStatus(task.id, 'succeeded', {outputSummary: summary})) ?? taskWithWorktree;
};

export const summarizeWorktreeTaskResult = (
  task: BgTask,
  worktreePath: string,
  branchName: string,
  agentOutput?: string,
): string => {
  const lines = [
    `Task: ${task.title}`,
    `Worktree: ${worktreePath}`,
    `Branch: ${branchName}`,
  ];
  if (agentOutput) lines.push(`Agent output: ${agentOutput.slice(0, 500)}`);
  lines.push(
    ``,
    `Next steps:`,
    `  1. Review changes in the worktree branch.`,
    `  2. Run: git diff ${task.parentBranch ?? 'main'}..${branchName}`,
    `  3. Merge when satisfied: git merge ${branchName}`,
    `  4. Remove worktree when done: apeironcode worktree remove <id> --yes`,
  );
  return lines.join('\n');
};
