import type {AgentDefinition} from './types.js';

export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {allowedTools: ['read_file', 'grep', 'glob', 'list_files'], description: 'Decomposes tasks into safe implementation steps.', kind: 'planner', name: 'planner', prompt: 'Plan before code. Identify risks, files, tests, and approval points.'},
  {allowedTools: ['read_file', 'grep', 'glob', 'edit_file', 'patch_file', 'test_runner'], description: 'Implements scoped code changes.', kind: 'coder', name: 'coder', prompt: 'Make focused code changes and preserve existing behavior.'},
  {allowedTools: ['test_runner', 'lint_runner', 'build_runner', 'read_file'], description: 'Runs validation and interprets failures.', kind: 'tester', name: 'tester', prompt: 'Validate changes, localize failures, and propose next checks.'},
  {allowedTools: ['git_diff', 'read_file', 'grep'], description: 'Reviews diffs for bugs and regressions.', kind: 'reviewer', name: 'reviewer', prompt: 'Review with findings first, ordered by severity.'},
  {allowedTools: ['read_file', 'grep', 'web_search'], description: 'Researches APIs and external behavior.', kind: 'researcher', name: 'researcher', prompt: 'Use public docs and cite sources when external facts matter.'},
  {allowedTools: ['read_file', 'grep', 'git_diff'], description: 'Reviews security-sensitive code paths.', kind: 'security-reviewer', name: 'security-reviewer', prompt: 'Focus on secrets, command execution, auth, permissions, and data exposure.'},
  {allowedTools: ['read_file', 'write_file', 'grep'], description: 'Updates docs from actual behavior.', kind: 'docs-writer', name: 'docs-writer', prompt: 'Document what is implemented and call out limits honestly.'},
  {allowedTools: ['lsp_symbols', 'lsp_diagnostics', 'read_file'], description: 'Uses LSP intelligence for code navigation.', kind: 'lsp-agent', name: 'lsp-agent', prompt: 'Use diagnostics, symbols, definitions, and references to target context.'},
  {allowedTools: ['git_status', 'git_diff', 'git_log'], description: 'Inspects Git state without publishing.', kind: 'git-agent', name: 'git-agent', prompt: 'Summarize local Git state and avoid destructive commands.'},
  {allowedTools: ['build_runner', 'test_runner', 'read_file'], description: 'Prepares release validation reports.', kind: 'release-manager', name: 'release-manager', prompt: 'Check package, docs, security, tests, and release notes.'},
  {allowedTools: ['read_file', 'grep', 'test_runner'], description: 'Debugs errors from traces or failing commands.', kind: 'debugger', name: 'debugger', prompt: 'Reproduce, isolate, patch, and verify the error.'},
];

export const listAgents = (): AgentDefinition[] => [...BUILT_IN_AGENTS];

export const getAgent = (name: string): AgentDefinition | null =>
  BUILT_IN_AGENTS.find((agent) => agent.name === name) ?? null;
