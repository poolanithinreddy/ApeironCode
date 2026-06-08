import {maybeSyncProjectBrainAfterRun} from '../projectBrain/autoSync.js';
import type {AgentTaskState} from './types.js';

/** Fire-and-forget auto-sync of Project Brain after an agent run. Never throws. */
export const triggerBrainAutoSyncAfterRun = (
  cwd: string,
  prompt: string,
  taskState: AgentTaskState | undefined,
  finalContent: string,
): void => {
  maybeSyncProjectBrainAfterRun(
    {
      changedFiles: taskState?.filesChanged ?? [],
      commandsRun: taskState?.commandsRun ?? [],
      prompt,
      taskOutput: finalContent.slice(0, 2_000),
      testsRun: taskState?.testsRun ?? [],
    },
    {cwd, mode: 'auto-safe'},
  ).catch(() => {});
};
