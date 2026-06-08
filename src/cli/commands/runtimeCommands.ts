import type {Command} from 'commander';
import type {CliHandlers} from './types.js';

export const registerRuntimeCommands = (program: Command, handlers: CliHandlers): void => {
  const runtimeCommand = program.command('runtime').description('inspect runtime state, checkpoints, and session snapshots');

  runtimeCommand
    .command('status')
    .description('show runtime status and latest checkpoint')
    .action(async () => {
      await handlers.runtimeStatus?.();
    });

  runtimeCommand
    .command('checkpoints')
    .description('list recent runtime checkpoints for this project')
    .action(async () => {
      await handlers.runtimeCheckpoints?.();
    });

  runtimeCommand
    .command('rollback <checkpointId>')
    .description('restore files from a checkpoint by id')
    .option('--yes', 'confirm rollback without interactive prompt')
    .action(async (checkpointId: string, options: {yes?: boolean}) => {
      await handlers.runtimeRollback?.(checkpointId, options);
    });

  runtimeCommand
    .command('summary')
    .description('show runtime summary for a session snapshot, or overall status when omitted')
    .argument('[sessionId]', 'session id to summarize')
    .action(async (sessionId?: string) => {
      await handlers.runtimeSummary?.(sessionId);
    });
};
