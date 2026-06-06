import {createAgentCommands} from './agent.js';
import {createFileCommands} from './file.js';
import {createGitCommands} from './git.js';
import {createIntelligenceCommands} from './intelligence.js';
import {createMemoryCommands} from './memory.js';
import {createPlanCommands} from './plan.js';
import {SlashCommandRegistry} from './registry.js';
import {createSessionCommands} from './session.js';
import {normalizeNaturalSlashInput, setSlashDefinitionsProvider, type SlashCommandContext, type SlashCommandDefinition} from './shared.js';
import {createSkillsCommands} from './skills.js';
import {createSubagentsCommands} from './subagents.js';
import {createSystemCommands} from './system.js';
import {createTeamCommands} from './team.js';

export {SlashCommandRegistry} from './registry.js';
export type {SlashCommandContext, SlashCommandDefinition} from './shared.js';
export {normalizeNaturalSlashInput} from './shared.js';

export type SlashCommand = Pick<SlashCommandDefinition, 'description' | 'examples' | 'name' | 'usage'>;

export const createDefinitions = (): SlashCommandDefinition[] => [
  ...createSystemCommands(),
  ...createAgentCommands(),
  ...createSessionCommands(),
  ...createPlanCommands(),
  ...createFileCommands(),
  ...createGitCommands(),
  ...createIntelligenceCommands(),
  ...createMemoryCommands(),
  ...createSkillsCommands(),
  ...createSubagentsCommands(),
  ...createTeamCommands(),
];

setSlashDefinitionsProvider(createDefinitions);

export const suggestSlashCommands = (command: string): string => {
  const normalized = command.toLowerCase();
  const suggestions = createDefinitions()
    .map((definition) => definition.name)
    .filter((name) => name.includes(normalized.slice(1, 5)) || normalized.includes(name.slice(1)))
    .slice(0, 5);
  return suggestions.length > 0
    ? `Unknown command: ${command}\nDid you mean: ${suggestions.join(', ')}?\nTry /commands beginner, /commands team, /commands memory, or /help.`
    : `Unknown command: ${command}\nTry /commands beginner, /commands setup, /commands team, or /help.`;
};

export const listSlashCommandDefinitions = (): SlashCommand[] => {
  const seen = new Set<string>();
  return createDefinitions()
    .filter((definition) => {
      if (seen.has(definition.name)) {
        return false;
      }
      seen.add(definition.name);
      return true;
    })
    .map(({description, examples, name, usage}) => ({
      description,
      examples,
      name,
      usage,
    }));
};

export const createSlashCommandRegistry = (): SlashCommandRegistry => {
  const registry = new SlashCommandRegistry();
  registry.registerCommands(listSlashCommandDefinitions());
  return registry;
};

export const executeSlashCommand = async (
  rawInput: string,
  context: SlashCommandContext,
): Promise<boolean> => {
  const normalizedInput = normalizeNaturalSlashInput(rawInput);
  const [command, ...args] = normalizedInput.split(/\s+/u);
  const definition = createDefinitions().find((candidate) => candidate.name === command);
  if (!definition) {
    context.appendLocalAssistantMessage(suggestSlashCommands(command ?? rawInput));
    return true;
  }
  await definition.run(args, context);
  return true;
};
