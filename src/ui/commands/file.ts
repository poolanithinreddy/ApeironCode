import type {SlashCommandDefinition} from './shared.js';

export const createFileCommands = (): SlashCommandDefinition[] => [
{
    description: 'Revert the latest edit, a specific edit id, or the latest edit for a file',
    name: '/revert',
    usage: '/revert last | /revert <editId> | /revert file <path>',
    async run(args, context) {
      const [subcommand, ...rest] = args;
      if (!subcommand || subcommand === 'last') {
        await context.runTool('revert_patch', {target: 'last'});
        return;
      }

      if (subcommand === 'file') {
        const filePath = rest.join(' ').trim();
        if (!filePath) {
          context.appendLocalAssistantMessage('Usage: /revert file <path>');
          return;
        }
        await context.runTool('revert_patch', {path: filePath});
        return;
      }

      await context.runTool('revert_patch', {editId: subcommand});
    },
  },
];
