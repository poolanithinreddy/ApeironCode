import {listCheckpoints, restoreCheckpoint, formatCheckpointSummary} from '../../agent/checkpoints.js';
import {formatResumeSummary, loadRuntimeSnapshot} from '../../agent/runtimeResume.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';

export const createRuntimeHandlers = (context: BootstrapRuntimeContext) => ({
  async runtimeCheckpoints(): Promise<void> {
    const checkpoints = await listCheckpoints(context.cwd);
    if (checkpoints.length === 0) {
      console.log('No runtime checkpoints found for this project.');
      return;
    }
    console.log(checkpoints.slice(0, 20).map(formatCheckpointSummary).join('\n\n'));
  },

  async runtimeRollback(checkpointId: string, options?: {yes?: boolean}): Promise<void> {
    if (!options?.yes) {
      console.log('Rollback requires --yes to restore files from a checkpoint.');
      return;
    }
    const checkpoint = (await listCheckpoints(context.cwd)).find((item) => item.id === checkpointId);
    if (!checkpoint) {
      console.log(`Checkpoint not found: ${checkpointId}`);
      return;
    }
    const result = await restoreCheckpoint(checkpoint);
    console.log(`Rollback complete. Restored ${result.restored.length}, removed ${result.removed.length}, skipped ${result.skipped.length}.`);
  },

  async runtimeStatus(): Promise<void> {
    const checkpoints = await listCheckpoints(context.cwd);
    console.log([
      'Runtime status',
      `Checkpoints: ${checkpoints.length}`,
      checkpoints[0] ? `Latest checkpoint: ${checkpoints[0].id} (${checkpoints[0].createdAt})` : 'Latest checkpoint: none',
    ].join('\n'));
  },

  async runtimeSummary(sessionId?: string): Promise<void> {
    if (!sessionId) {
      await this.runtimeStatus();
      return;
    }
    const snapshot = await loadRuntimeSnapshot(context.cwd, sessionId);
    console.log(snapshot ? formatResumeSummary(snapshot) : `No resumable runtime snapshot found for ${sessionId}.`);
  },
});
