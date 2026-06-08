import type {SlashCommandContext, SlashCommandDefinition} from './shared.js';
import {toDisplayString} from '../../utils/display.js';

export const appendSlashMessage = (context: SlashCommandContext, value: unknown): void => {
  context.appendLocalAssistantMessage(toDisplayString(value));
};

export const formatSlashCommandDetails = (definition: SlashCommandDefinition): string => {
  const badges = [
    definition.category ?? 'General',
    definition.status ?? 'stable',
  ].join(' | ');
  return [
    `${definition.usage} — ${definition.description}`,
    `Status: ${badges}`,
    ...(definition.examples ?? []).map((example) => `Example: ${example}`),
  ].join('\n');
};

export const formatSlashCommandCompact = (definition: SlashCommandDefinition): string => {
  const badges = [definition.category ?? 'General', definition.status ?? 'stable'].join(' | ');
  return [
    `${definition.usage} — ${definition.description}`,
    `  ${badges}${definition.examples?.[0] ? ` | ${definition.examples[0]}` : ''}`,
  ].join('\n');
};

export const formatSlashCommandCatalog = (definitions: SlashCommandDefinition[], query?: string): string => {
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  const beginner = normalizedQuery === 'beginner';
  const advanced = normalizedQuery === 'advanced';
  const beginnerNames = new Set(['/start', '/setup', '/dashboard', '/status', '/explain', '/fix', '/review', '/provider', '/model', '/doctor', '/security', '/sandbox']);
  const advancedNames = new Set(['/team', '/agent', '/hooks', '/hook', '/lsp', '/share', '/mcp', '/plugins', '/tools', '/permissions', '/web']);
  const categories: Array<{label: string; matches: string[]}> = [
    {label: 'Start', matches: ['/start', '/dashboard', '/status', '/explain']},
    {label: 'Setup', matches: ['/setup', '/doctor']},
    {label: 'Agent', matches: ['/mode', '/fix', '/debug', '/feature', '/review', '/refactor', '/commit']},
    {label: 'Sessions', matches: ['/sessions', '/session', '/history', '/search']},
    {label: 'Skills', matches: ['/skills', '/skill']},
    {label: 'Memory', matches: ['/memory', '/memory-graph']},
    {label: 'GitHub', matches: ['/github']},
    {label: 'Provider/Models', matches: ['/provider', '/model', '/ollama', '/config']},
    {label: 'LSP', matches: ['/lsp']},
    {label: 'Workflows', matches: ['/workflow', '/test', '/lint', '/build', '/repo', '/context', '/eval']},
    {label: 'Team/Cockpit', matches: ['/agent', '/team']},
    {label: 'Hooks', matches: ['/hooks', '/hook']},
    {label: 'Share/export', matches: ['/cost', '/web', '/plugins', '/mcp', '/tools', '/permissions', '/clear', '/compact', '/exit', '/help', '/commands']},
    {label: 'Security', matches: ['/security', '/sandbox']},
  ];
  const categoryMatch = categories.find((category) =>
    category.label.toLowerCase().includes(normalizedQuery)
    || category.matches.some((name) => name.slice(1).includes(normalizedQuery)),
  );
  const source = beginner
    ? definitions.filter((definition) => beginnerNames.has(definition.name))
    : advanced
      ? definitions.filter((definition) => advancedNames.has(definition.name) || ['Team/Cockpit', 'Hooks', 'LSP', 'Share/Export', 'Debug'].includes(definition.category ?? ''))
      : categoryMatch && normalizedQuery
        ? definitions.filter((definition) => categoryMatch.matches.includes(definition.name))
        : definitions;
  if (beginner) {
    return [
      'Command Palette — beginner',
      'Recommended next: /setup, then /explain repo or /fix tests.',
      '',
      ...source.map(formatSlashCommandCompact),
      '',
      'Need more? /commands team, /commands memory, /commands provider, or /commands advanced.',
    ].join('\n');
  }
  const used = new Set<string>();
  const sections = categories
    .map((category) => {
      const commands = source.filter((definition) => category.matches.includes(definition.name));
      commands.forEach((command) => used.add(command.name));
      return commands.length > 0
        ? [`## ${category.label}`, ...commands.map((definition) => formatSlashCommandDetails(definition))].join('\n\n')
        : '';
    })
    .filter(Boolean);
  const uncategorized = source.filter((definition) => !used.has(definition.name));
  if (uncategorized.length > 0) {
    sections.push(['## Other', ...uncategorized.map((definition) => formatSlashCommandDetails(definition))].join('\n\n'));
  }
  const next = beginner
    ? 'Recommended next: /setup, then /explain repo or /fix tests.'
    : 'Tip: use /commands beginner, /commands team, /commands memory, or /commands provider.';
  return [`Command Palette${query ? ` — ${query}` : ''}`, next, '', ...sections].join('\n\n');
};

export const filterSlashCommandCatalog = (
  definitions: SlashCommandDefinition[],
  query: string,
): SlashCommandDefinition[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return definitions;
  }
  return definitions.filter((definition) =>
    [definition.name, definition.usage, definition.description, ...(definition.examples ?? [])]
      .join('\n')
      .toLowerCase()
      .includes(normalized),
  );
};

export const findSlashCommandDefinition = (
  definitions: SlashCommandDefinition[],
  commandName: string,
): SlashCommandDefinition | undefined => {
  const normalized = commandName.startsWith('/') ? commandName : `/${commandName}`;
  return definitions.find((definition) => definition.name === normalized);
};
