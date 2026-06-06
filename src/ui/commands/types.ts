import type {listSlashCommandDefinitions} from './legacy.js';

export type {SlashCommandContext} from './legacy.js';

export type SlashCommand = ReturnType<typeof listSlashCommandDefinitions>[number];

export interface SlashCommandResult {
  handled: boolean;
  message?: string;
}

export type SlashCommandFactory = () => SlashCommand[];
