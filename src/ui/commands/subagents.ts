import type {SlashCommandDefinition} from './shared.js';

export const createSubagentsCommands = (): SlashCommandDefinition[] => [
{
    description: 'List specialized agents',
    examples: ['/agents'],
    name: '/agents',
    usage: '/agents',
    async run(_args, context) {
      const {formatAgents} = await import('../../agents/format.js');
      const {listAgents} = await import('../../agents/registry.js');
      context.appendLocalAssistantMessage(formatAgents(listAgents()));
    },
  },
{
    description: 'Prepare a subagent task',
    examples: ['/agent run reviewer review current diff'],
    name: '/agent',
    usage: '/agent run <name> <task>',
    async run(args, context) {
      const {formatSubagentRun} = await import('../../agents/format.js');
      const {runSubagentDryRun} = await import('../../agents/subagentRunner.js');
      const [subcommand, name, ...taskParts] = args;
      if (subcommand !== 'run' || !name || taskParts.length === 0) {
        context.appendLocalAssistantMessage('Usage: /agent run <name> <task>');
        return;
      }
      context.appendLocalAssistantMessage(formatSubagentRun(runSubagentDryRun(name, taskParts.join(' '))));
    },
  },
];
