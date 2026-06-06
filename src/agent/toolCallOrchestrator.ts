export type ToolCallRisk = 'readonly' | 'write' | 'command' | 'connector';

const READONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'list_files',
  'grep_search',
  'grep',
  'search_file',
  'glob',
  'repo_map',
  'memorySearch',
  'memoryGraph',
  'memoryRelated',
  'file_info',
  'project_tree',
  'package_info',
  'git_status',
  'git_diff',
  'git_log',
  'git_branch',
  'command_status',
  'command_output',
]);

const WRITE_TOOLS = new Set([
  'edit_file',
  'write_file',
  'patch_file',
  'revert_patch',
  'todo_write',
]);

const COMMAND_TOOLS = new Set([
  'run_command',
  'test_runner',
  'lint_runner',
  'build_runner',
  'kill_command',
  'git_commit',
]);

export const classifyToolCallRisk = (toolName: string): ToolCallRisk => {
  if (READONLY_TOOLS.has(toolName)) return 'readonly';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  if (COMMAND_TOOLS.has(toolName)) return 'command';
  if (
    toolName.startsWith('mcp_')
    || toolName.startsWith('mcp:')
    || toolName.startsWith('github_')
    || toolName.startsWith('linear_')
    || toolName.startsWith('jira_')
    || toolName.startsWith('slack_')
    || toolName === 'web_fetch'
    || toolName === 'web_search'
  ) {
    return 'connector';
  }
  // Unknown tools default to connector (treated cautiously - serial)
  return 'connector';
};

export interface OrchestratedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  error?: Error;
  index: number;
}

export interface OrchestrationGroup {
  risk: ToolCallRisk;
  callIndices: number[];
  parallel: boolean;
}

export interface OrchestrationPlan {
  groups: OrchestrationGroup[];
}

export const planToolCallExecution = (
  toolCalls: Array<{id: string; name: string}>,
): OrchestrationPlan => {
  const groups: OrchestrationGroup[] = [];
  let pendingReads: number[] = [];

  const flushReads = (): void => {
    if (pendingReads.length > 0) {
      groups.push({
        risk: 'readonly',
        callIndices: pendingReads,
        parallel: pendingReads.length > 1,
      });
      pendingReads = [];
    }
  };

  toolCalls.forEach((call, index) => {
    const risk = classifyToolCallRisk(call.name);
    if (risk === 'readonly') {
      pendingReads.push(index);
      return;
    }
    flushReads();
    groups.push({risk, callIndices: [index], parallel: false});
  });
  flushReads();

  return {groups};
};

export interface OrchestratorOptions {
  onStart?: (id: string, name: string) => void;
  onComplete?: (result: OrchestratedToolResult) => void;
}

export const executeOrchestrated = async (
  toolCalls: Array<{id: string; name: string; input: unknown}>,
  executor: (id: string, name: string, input: unknown) => Promise<unknown>,
  options: OrchestratorOptions = {},
): Promise<OrchestratedToolResult[]> => {
  const plan = planToolCallExecution(toolCalls);
  const results: OrchestratedToolResult[] = new Array<OrchestratedToolResult>(toolCalls.length);

  const runOne = async (index: number): Promise<void> => {
    const call = toolCalls[index]!;
    options.onStart?.(call.id, call.name);
    try {
      const result = await executor(call.id, call.name, call.input);
      const out: OrchestratedToolResult = {
        toolCallId: call.id,
        toolName: call.name,
        result,
        index,
      };
      results[index] = out;
      options.onComplete?.(out);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const out: OrchestratedToolResult = {
        toolCallId: call.id,
        toolName: call.name,
        result: undefined,
        error: err,
        index,
      };
      results[index] = out;
      options.onComplete?.(out);
    }
  };

  for (const group of plan.groups) {
    if (group.parallel) {
      await Promise.all(group.callIndices.map((idx) => runOne(idx)));
    } else {
      for (const idx of group.callIndices) {
        await runOne(idx);
      }
    }
  }

  return results;
};
