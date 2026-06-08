import path from 'node:path';

export interface ToolLockTarget {
  shouldLock: boolean;
  filePaths: string[];
  reason: string;
}

export const MODIFYING_TOOLS = new Set([
  'edit_file',
  'write_file',
  'patch_file',
  'revert_patch',
  'delete_file',
]);

export const POTENTIALLY_MODIFYING_TOOLS = new Set([
  'run_command',
  'git_commit',
]);

export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'grep',
  'glob',
  'list_files',
  'project_tree',
  'git_diff',
  'git_status',
  'git_log',
  'git_branch',
  'git_pr_description',
  'package_info',
  'file_info',
  'command_status',
  'command_output',
  'project_command',
]);

/**
 * Determines if a tool modifies files and extracts target file paths.
 * Returns shouldLock=true for tools that definitely modify files.
 */
export const extractToolLockTargets = (
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): ToolLockTarget => {
  // Definitely modifying tools
  if (MODIFYING_TOOLS.has(toolName)) {
    const filePath = extractFilePathFromInput(input, toolName);
    if (filePath) {
      const resolved = path.resolve(cwd, filePath);
      return {
        shouldLock: true,
        filePaths: [resolved],
        reason: `Tool ${toolName} modifies file`,
      };
    }
    return {
      shouldLock: true,
      filePaths: [],
      reason: `Tool ${toolName} modifies files (target not resolvable)`,
    };
  }

  // Read-only tools - never lock
  if (READ_ONLY_TOOLS.has(toolName)) {
    return {
      shouldLock: false,
      filePaths: [],
      reason: `Tool ${toolName} is read-only`,
    };
  }

  // Potentially modifying tools - don't lock for now (run_command is too broad)
  if (POTENTIALLY_MODIFYING_TOOLS.has(toolName)) {
    return {
      shouldLock: false,
      filePaths: [],
      reason: `Tool ${toolName} requires explicit user approval, not locked by default`,
    };
  }

  // Unknown tools - conservative: don't lock
  return {
    shouldLock: false,
    filePaths: [],
    reason: `Tool ${toolName} is unknown, no lock applied`,
  };
};

/**
 * Extracts file path from tool input based on tool name.
 */
export const extractFilePathFromInput = (
  input: Record<string, unknown>,
  toolName: string,
): string | null => {
  // Common field names for file paths
  const pathFields = ['path', 'filePath', 'file'];

  for (const field of pathFields) {
    if (typeof input[field] === 'string') {
      return input[field];
    }
  }

  // Tool-specific extraction
  switch (toolName) {
    case 'revert_patch':
      // revert_patch returns editId or path
      if (typeof input.path === 'string') {
        return input.path;
      }
      break;
    default:
      break;
  }

  return null;
};

/**
 * Checks if a session is active (can hold locks).
 */
export const isSessionActive = (status: string): boolean => {
  return status === 'running' || status === 'paused';
};

/**
 * Formats a helpful lock conflict message.
 */
export const formatLockConflictMessage = (
  filePath: string,
  blockingSessionId: string,
  blockingSessionGoal: string,
  blockingSessionStatus: string,
): string => {
  return [
    'Blocked by file lock',
    '',
    `${filePath} is locked by session ${blockingSessionId}:`,
    `Goal: ${blockingSessionGoal}`,
    `Status: ${blockingSessionStatus}`,
    '',
    'To inspect:',
    `  apeironcode session show ${blockingSessionId}`,
    `  apeironcode session attach ${blockingSessionId}`,
    '',
    'To stop and release locks:',
    `  apeironcode session stop ${blockingSessionId}`,
  ].join('\n');
};
