/**
 * Checkpoint-aware task resume (Phase 16D.1).
 *
 * Determines the best resume strategy for a stopped/paused/failed task:
 *   1. Checkpoint resume — if a runtime snapshot exists for the task's session.
 *   2. Worktree re-run — if the task has an isolated worktree, re-run there.
 *   3. Fresh re-run — re-run from the original prompt.
 *
 * Never pretends a checkpoint resume happened if it did not.
 * Never auto-restores files. Worktree cwd is always respected.
 */

import {redactSecrets} from '../share/redactor.js';
import {loadRuntimeSnapshot, formatResumeSummary} from '../agent/runtimeResume.js';
import type {RuntimeResumeSnapshot} from '../agent/runtimeResume.js';
import {listCheckpoints} from '../agent/checkpoints.js';
import type {BgTask} from './bgTask.js';
import {isResumableStatus} from './bgTask.js';

export type ResumeStrategy = 'checkpoint' | 'worktree-rerun' | 'fresh-rerun' | 'not-resumable';

export interface TaskResumePlan {
  taskId: string;
  strategy: ResumeStrategy;
  cwd: string;
  prompt: string;
  reason: string;
  /** Runtime snapshot if checkpoint resume is available. */
  snapshot?: RuntimeResumeSnapshot;
  /** Checkpoint ID if a checkpoint was found. */
  checkpointId?: string;
}

/**
 * Whether a task is in a state that can attempt resume.
 */
export const canResumeTask = (task: BgTask): boolean =>
  isResumableStatus(task.status) || task.status === 'failed';

/**
 * Build a resume plan for the given task.
 * Checks for runtime snapshots and checkpoints; falls back gracefully.
 */
export const buildTaskResumePlan = async (task: BgTask): Promise<TaskResumePlan> => {
  const cwd = task.worktreePath ?? task.cwd;
  const prompt = redactSecrets(task.prompt ?? task.title);

  if (!canResumeTask(task)) {
    return {
      taskId: task.id,
      strategy: 'not-resumable',
      cwd,
      prompt,
      reason: `Task status "${task.status}" is not resumable.`,
    };
  }

  // 1. Try runtime snapshot (session-based checkpoint resume)
  const sessionId = task.metadata?.sessionId as string | undefined;
  if (sessionId) {
    try {
      const snapshot = await loadRuntimeSnapshot(cwd, sessionId);
      if (snapshot) {
        return {
          taskId: task.id,
          strategy: 'checkpoint',
          cwd,
          prompt,
          reason: `Runtime snapshot found for session ${sessionId}. Resuming from checkpoint.`,
          snapshot,
          checkpointId: snapshot.checkpointId,
        };
      }
    } catch {
      // Snapshot unavailable — continue to next strategy
    }
  }

  // 2. Try task-level checkpointId
  if (task.checkpointId) {
    try {
      const checkpoints = await listCheckpoints(cwd);
      const match = checkpoints.find((c) => c.id === task.checkpointId);
      if (match) {
        return {
          taskId: task.id,
          strategy: 'checkpoint',
          cwd,
          prompt,
          reason: `Checkpoint ${task.checkpointId} found. Resuming from checkpoint.`,
          checkpointId: task.checkpointId,
        };
      }
    } catch {
      // Checkpoint lookup failed — continue
    }
  }

  // 3. Worktree re-run
  if (task.worktreePath) {
    return {
      taskId: task.id,
      strategy: 'worktree-rerun',
      cwd: task.worktreePath,
      prompt,
      reason: `No checkpoint found. Re-running task in existing worktree: ${task.worktreePath}`,
    };
  }

  // 4. Fresh re-run
  return {
    taskId: task.id,
    strategy: 'fresh-rerun',
    cwd: task.cwd,
    prompt,
    reason: `No checkpoint or worktree found. Re-running task from original prompt.`,
  };
};

/**
 * Execute a checkpoint-based resume if snapshot is available.
 * Returns a structured result — caller decides how to wire into Agent.run().
 */
export const resumeTaskFromCheckpoint = (
  _task: BgTask,
  plan: TaskResumePlan,
): {executed: boolean; summary: string} => {
  if (plan.strategy !== 'checkpoint' || !plan.snapshot) {
    return {
      executed: false,
      summary: `No checkpoint resume performed. Strategy: ${plan.strategy}. ${plan.reason}`,
    };
  }

  const snapshotSummary = formatResumeSummary(plan.snapshot);
  return {
    executed: true,
    summary: redactSecrets(`Checkpoint resume ready.\n${snapshotSummary}`),
  };
};

/**
 * Format a TaskResumePlan for safe display (no secrets).
 */
export const formatTaskResumePlan = (plan: TaskResumePlan): string => {
  const lines = [
    `Resume strategy: ${plan.strategy}`,
    `Task: ${plan.taskId.slice(0, 8)}`,
    `CWD: ${plan.cwd}`,
    `Reason: ${plan.reason}`,
  ];
  if (plan.checkpointId) lines.push(`Checkpoint: ${plan.checkpointId}`);
  if (plan.snapshot) lines.push(`Snapshot session: ${plan.snapshot.sessionId}`);
  return redactSecrets(lines.join('\n'));
};
