import {describe, expect, it} from 'vitest';

import {
  createSlashCommandRegistry,
  listSlashCommandDefinitions,
  SlashCommandRegistry,
} from '../../../src/ui/commands/index.js';
import {
  createAgentCommands,
  createFileCommands,
  createGitCommands,
  createMemoryCommands,
  createPlanCommands,
  createSessionCommands,
  createSkillsCommands,
  createSystemCommands,
  createTeamCommands,
} from '../../../src/ui/commands/groups.js';

describe('SlashCommandRegistry', () => {
  it('registers commands and resolves aliases', () => {
    const [help] = listSlashCommandDefinitions();
    expect(help).toBeDefined();
    const registry = new SlashCommandRegistry();

    registry.registerCommand(help!, ['/h']);

    expect(registry.findCommand('/help')).toBe(help);
    expect(registry.findCommand('/h')).toBe(help);
  });

  it('detects duplicate command triggers and aliases', () => {
    const [help, commands] = listSlashCommandDefinitions();
    expect(help).toBeDefined();
    expect(commands).toBeDefined();
    const registry = new SlashCommandRegistry();

    registry.registerCommand(help!);

    expect(() => registry.registerCommand(help!)).toThrow(/Duplicate slash command/u);
    expect(() => registry.registerCommand(commands!, ['/help'])).toThrow(/Duplicate slash command/u);
  });

  it('generates compact help text from registered commands', () => {
    const registry = createSlashCommandRegistry();

    expect(registry.getHelpText()).toContain('/help');
    expect(registry.getHelpText()).toContain('/memory');
  });

  it('keeps compatibility definitions reachable through the new factory', () => {
    const registry = createSlashCommandRegistry();
    const names = registry.getAllCommands().map((command) => command.name);

    expect(names).toContain('/commands');
    expect(names).toContain('/provider');
    expect(names).toContain('/memory');
    expect(names).toContain('/team');
  });

  it('groups expected slash commands by domain', () => {
    expect(createFileCommands().map((command) => command.name)).toContain('/revert');
    expect(createSessionCommands().map((command) => command.name)).toContain('/history');
    expect(createAgentCommands().map((command) => command.name)).toContain('/provider');
    expect(createMemoryCommands().map((command) => command.name)).toContain('/memory');
    expect(createGitCommands().map((command) => command.name)).toContain('/commit');
    expect(createSkillsCommands().map((command) => command.name)).toContain('/skill');
    expect(createTeamCommands().map((command) => command.name)).toContain('/team');
    expect(createPlanCommands().map((command) => command.name)).toContain('/plan');
    expect(createSystemCommands().map((command) => command.name)).toContain('/help');
  });
});
