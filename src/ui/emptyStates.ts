/**
 * Helper functions to create consistent empty/error state messages
 * Format: What happened | Why | Next step
 */

export const emptyStates = {
  noProviderConfigured: [
    'No provider configured.',
    'You need to set up an AI provider (mock, Ollama, or cloud) to use ApeironCode.',
    '',
    'Next: /setup',
  ].join('\n'),

  noSkillsInstalled: [
    'No skills installed.',
    'Skills extend ApeironCode with new capabilities (GitHub automation, database tools, etc).',
    '',
    'Next: /skill browser',
  ].join('\n'),

  noMemorySuggestions: [
    'No memory suggestions yet.',
    'Memory suggestions appear after sessions that change project understanding.',
    '',
    'Next: Run /fix <issue> or /review diff to create memories.',
  ].join('\n'),

  noTeamRuns: [
    'No team runs in history.',
    'Team runs coordinate multiple agents on complex tasks (multi-file refactoring, etc).',
    '',
    'Next: /team run "refactor this feature"',
  ].join('\n'),

  noSessions: [
    'No sessions yet.',
    'Sessions track agent work across invocations (memory, file changes, commands).',
    '',
    'Next: Run any command (e.g. /fix failing tests) to create a session.',
  ].join('\n'),

  missingTeamRunId: (providedId?: string) => [
    `Team run not found${providedId ? `: ${providedId}` : ''}.`,
    'Team run IDs are created when you run /team run <goal>.',
    '',
    'Next: /team runs (to see available runs) or /team run "new goal"',
  ].join('\n'),

  missingGitHubToken: [
    'GitHub token not configured.',
    'Set GITHUB_TOKEN to use GitHub automation (/github issue create, /github pr comment, etc).',
    '',
    'Next: /setup or export GITHUB_TOKEN=your_token_here',
  ].join('\n'),

  ollamaUnavailable: [
    'Ollama is not running.',
    'Ollama is a local LLM server. If configured as your provider, it must be running.',
    '',
    'Next: ollama serve (in another terminal) or /provider list (to try another provider)',
  ].join('\n'),

  sandboxUnavailable: [
    'OS sandboxing is not available on this system.',
    'Sandboxing isolates agent tool execution. Without it, all operations run with full permissions.',
    '',
    'Next: Review /security status and set approval mode to "ask"',
  ].join('\n'),

  providerFallbackNotConfigured: [
    'Provider fallback is not configured.',
    'If your primary provider fails, a fallback ensures agent work can continue.',
    '',
    'Next: /provider fallback simulate rate-limit (to test) or configure manually',
  ].join('\n'),

  unknownCommand: (command: string) => [
    `Unknown command: ${command}`,
    `"${command}" is not a recognized ApeironCode command or slash command.`,
    '',
    `Next: /commands search ${command} (to search for similar commands) or /help (for all commands)`,
  ].join('\n'),

  missingFixture: (fixtureId?: string) => [
    `Fixture not found${fixtureId ? `: ${fixtureId}` : ''}.`,
    'Fixtures are demo environments for testing team workflows and cockpit UX.',
    '',
    'Next: npm run demo:cockpit (to create a fixture) or /team runs (to see real team runs)',
  ].join('\n'),

  commandFailed: (commandName: string, errorHint?: string) => [
    `Command failed: ${commandName}`,
    errorHint ?? 'The command encountered an error and could not complete.',
    '',
    'Next: /debug (for error details) or /help <command> (to review syntax)',
  ].join('\n'),

  noResults: (query: string, searchType: 'command' | 'memory' | 'file' | 'symbol') => {
    const typeName = {
      command: 'command',
      memory: 'memory entry',
      file: 'file',
      symbol: 'symbol',
    }[searchType];

    return [
      `No ${typeName}s found for: "${query}"`,
      `Search did not match any ${typeName}s in the project or configuration.`,
      '',
      `Next: Try a different query or use /help to discover what's available`,
    ].join('\n');
  },

  notImplemented: (featureName: string) => [
    `${featureName} is not yet implemented.`,
    `This feature is planned but not currently available.`,
    '',
    `Next: /help (to see what is available) or check docs/ROADMAP.md`,
  ].join('\n'),
};

export const errorStates = {
  permissionDenied: (action: string, reason?: string) => [
    `Permission denied: ${action}`,
    `This action requires approval based on security settings.`,
    reason ? `Reason: ${reason}` : '',
    '',
    'Next: Review the approval prompt or adjust permissions with /security permissions',
  ].filter(Boolean).join('\n'),

  invalidInput: (fieldName: string, example?: string) => [
    `Invalid input: ${fieldName}`,
    example ? `Expected format: ${example}` : 'Input did not meet requirements.',
    '',
    'Next: Try again with correct input or /help <command>',
  ].join('\n'),

  networkError: (serviceName: string) => [
    `Network error: Could not reach ${serviceName}`,
    `Check your internet connection and service status.`,
    '',
    'Next: Try again or /provider list (to choose a different provider)',
  ].join('\n'),

  fileNotFound: (filePath: string) => [
    `File not found: ${filePath}`,
    `The file does not exist or is not accessible from the current directory.`,
    '',
    'Next: Verify the path and try again',
  ].join('\n'),

  configError: (issue: string) => [
    `Configuration error: ${issue}`,
    `Your ApeironCode config is incomplete or invalid.`,
    '',
    'Next: /setup (to reconfigure) or /setup status (to check current config)',
  ].join('\n'),
};

/**
 * Format a user-friendly error message
 */
export const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred. Enable debug mode for details.';
};
