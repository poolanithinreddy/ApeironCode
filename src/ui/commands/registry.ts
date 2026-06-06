import type {SlashCommand} from './types.js';

export class SlashCommandRegistry {
  private readonly commands = new Map<string, SlashCommand>();
  private readonly aliases = new Map<string, string>();

  registerCommand(command: SlashCommand, aliases: string[] = []): void {
    this.assertAvailable(command.name, command.name);
    this.commands.set(command.name, command);

    for (const alias of aliases) {
      this.assertAvailable(alias, command.name);
      this.aliases.set(alias, command.name);
    }
  }

  registerCommands(commands: SlashCommand[], aliases: Record<string, string[]> = {}): void {
    for (const command of commands) {
      this.registerCommand(command, aliases[command.name] ?? []);
    }
  }

  findCommand(trigger: string): SlashCommand | undefined {
    return this.commands.get(this.aliases.get(trigger) ?? trigger);
  }

  getAllCommands(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  getHelpText(): string {
    return this.getAllCommands()
      .map((command) => `${command.name} ${command.usage} - ${command.description}`.trim())
      .join('\n');
  }

  private assertAvailable(trigger: string, owner: string): void {
    const existing = this.commands.get(trigger) ?? this.commands.get(this.aliases.get(trigger) ?? '');
    if (existing) {
      throw new Error(`Duplicate slash command trigger "${trigger}" for ${owner}; already registered by ${existing.name}.`);
    }
    if (this.aliases.has(trigger)) {
      throw new Error(`Duplicate slash command alias "${trigger}" for ${owner}.`);
    }
  }
}
