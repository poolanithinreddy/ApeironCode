import type {AgentDefinition, AgentKind} from './types.js';

export interface SubagentPolicy {
  allowedTools: string[];
  canEdit: boolean;
  canRunCommands: boolean;
  canUseNetwork: boolean;
  canWriteMemory: boolean;
  deniedTools: string[];
  maxIterations: number;
  parallelSafe: boolean;
  requiresPlanApproval: boolean;
}

const POLICY_BY_KIND: Record<AgentKind, SubagentPolicy> = {
  coder: {
    allowedTools: ['read_file', 'grep', 'glob', 'edit_file', 'patch_file', 'write_file', 'test_runner', 'package_info', 'project_tree'],
    canEdit: true,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['git_commit', 'web_fetch', 'web_search', 'web_research'],
    maxIterations: 8,
    parallelSafe: false,
    requiresPlanApproval: true,
  },
  debugger: {
    allowedTools: ['read_file', 'grep', 'glob', 'test_runner', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'git_commit'],
    maxIterations: 6,
    parallelSafe: false,
    requiresPlanApproval: false,
  },
  'docs-writer': {
    allowedTools: ['read_file', 'grep', 'glob', 'edit_file', 'patch_file', 'write_file', 'package_info', 'project_tree'],
    canEdit: true,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['git_commit', 'run_command', 'test_runner'],
    maxIterations: 6,
    parallelSafe: false,
    requiresPlanApproval: true,
  },
  'git-agent': {
    allowedTools: ['git_status', 'git_diff', 'git_log', 'git_branch'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: false,
    deniedTools: ['git_commit', 'edit_file', 'patch_file', 'write_file'],
    maxIterations: 4,
    parallelSafe: true,
    requiresPlanApproval: false,
  },
  'lsp-agent': {
    allowedTools: ['lsp_symbols', 'lsp_diagnostics', 'read_file', 'grep', 'glob'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: false,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'test_runner'],
    maxIterations: 4,
    parallelSafe: true,
    requiresPlanApproval: false,
  },
  planner: {
    allowedTools: ['read_file', 'grep', 'glob', 'list_files', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: false,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'test_runner', 'lint_runner', 'build_runner', 'run_command', 'git_commit'],
    maxIterations: 4,
    parallelSafe: true,
    requiresPlanApproval: false,
  },
  'release-manager': {
    allowedTools: ['read_file', 'grep', 'glob', 'test_runner', 'lint_runner', 'build_runner', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'git_commit'],
    maxIterations: 6,
    parallelSafe: false,
    requiresPlanApproval: false,
  },
  researcher: {
    allowedTools: ['read_file', 'grep', 'glob', 'web_search', 'web_fetch'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: true,
    canWriteMemory: true,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'git_commit', 'run_command'],
    maxIterations: 6,
    parallelSafe: false,
    requiresPlanApproval: false,
  },
  reviewer: {
    allowedTools: ['git_diff', 'read_file', 'grep', 'glob', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: false,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'test_runner', 'run_command', 'git_commit'],
    maxIterations: 5,
    parallelSafe: true,
    requiresPlanApproval: false,
  },
  'security-reviewer': {
    allowedTools: ['read_file', 'grep', 'glob', 'git_diff', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: false,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'run_command', 'git_commit'],
    maxIterations: 6,
    parallelSafe: true,
    requiresPlanApproval: false,
  },
  tester: {
    allowedTools: ['test_runner', 'lint_runner', 'build_runner', 'read_file', 'grep', 'package_info', 'project_tree'],
    canEdit: false,
    canRunCommands: true,
    canUseNetwork: false,
    canWriteMemory: true,
    deniedTools: ['edit_file', 'patch_file', 'write_file', 'git_commit', 'web_fetch', 'web_search'],
    maxIterations: 6,
    parallelSafe: false,
    requiresPlanApproval: false,
  },
};

export const getSubagentPolicy = (agent: AgentDefinition): SubagentPolicy => POLICY_BY_KIND[agent.kind];

export const formatSubagentPolicy = (policy: SubagentPolicy): string => [
  `Allowed tools: ${policy.allowedTools.join(', ') || 'none'}`,
  `Denied tools: ${policy.deniedTools.join(', ') || 'none'}`,
  `Can edit: ${policy.canEdit ? 'yes' : 'no'}`,
  `Can run commands: ${policy.canRunCommands ? 'yes' : 'no'}`,
  `Can use network: ${policy.canUseNetwork ? 'yes' : 'no'}`,
  `Parallel read-only safe: ${policy.parallelSafe ? 'yes' : 'no'}`,
  `Requires plan approval: ${policy.requiresPlanApproval ? 'yes' : 'no'}`,
  `Max iterations: ${policy.maxIterations}`,
].join('\n');
