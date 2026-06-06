import {redactSecretLikeContent} from '../memory/safety.js';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  filesChanged?: string[];
  exitCode?: number;
  truncated?: boolean;
}

export interface ToolBatchSummary {
  toolsRun: string[];
  filesRead: string[];
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  failures: Array<{name: string; summary: string}>;
  checkpointCreated: boolean;
  rollbackOccurred: boolean;
  tokensSaved?: number;
  nextRecommendedAction?: string;
}

const READ_TOOLS = new Set(['read_file', 'list_directory', 'grep_search', 'search_file']);
const COMMAND_TOOLS = new Set(['run_command', 'build_runner', 'lint_runner']);

const stringField = (input: Record<string, unknown>, key: string): string => {
  const v = input[key];
  return typeof v === 'string' ? v : '';
};

export const summarizeToolBatch = (
  calls: ToolCall[],
  results: ToolCallResult[],
  options?: {checkpointCreated?: boolean; rollbackOccurred?: boolean; tokenBudget?: number},
): ToolBatchSummary => {
  const summary: ToolBatchSummary = {
    toolsRun: calls.map((c) => c.name),
    filesRead: [],
    filesChanged: [],
    commandsRun: [],
    testsRun: [],
    failures: [],
    checkpointCreated: options?.checkpointCreated ?? false,
    rollbackOccurred: options?.rollbackOccurred ?? false,
  };

  for (const result of results) {
    if (!result.ok) {
      summary.failures.push({
        name: result.name,
        summary: redactSecretLikeContent(result.summary).slice(0, 200),
      });
    }
    if (result.filesChanged) summary.filesChanged.push(...result.filesChanged);
  }

  for (const call of calls) {
    if (READ_TOOLS.has(call.name)) {
      const path = stringField(call.input, 'path');
      if (path) summary.filesRead.push(path);
    }
    if (COMMAND_TOOLS.has(call.name)) {
      const cmd = stringField(call.input, 'command') || call.name;
      summary.commandsRun.push(cmd);
    }
    if (call.name === 'test_runner') {
      const cmd = stringField(call.input, 'command') || 'tests';
      summary.testsRun.push(cmd);
    }
  }

  return summary;
};

export const formatToolBatchSummary = (summary: ToolBatchSummary): string => {
  const parts: string[] = ['Tool batch summary:'];
  if (summary.toolsRun.length) parts.push(`  Tools: ${summary.toolsRun.join(', ')}`);
  if (summary.filesChanged.length) parts.push(`  Changed: ${summary.filesChanged.join(', ')}`);
  if (summary.filesRead.length) {
    const head = summary.filesRead.slice(0, 5).join(', ');
    const more = summary.filesRead.length > 5 ? ` +${summary.filesRead.length - 5}` : '';
    parts.push(`  Read: ${head}${more}`);
  }
  if (summary.commandsRun.length) parts.push(`  Commands: ${summary.commandsRun.join(', ')}`);
  if (summary.testsRun.length) parts.push(`  Tests: ${summary.testsRun.join(', ')}`);
  if (summary.failures.length) {
    parts.push(`  Failures (${summary.failures.length}):`);
    for (const f of summary.failures) {
      parts.push(`    - ${f.name}: ${redactSecretLikeContent(f.summary).slice(0, 100)}`);
    }
  }
  if (summary.checkpointCreated) parts.push('  Checkpoint created.');
  if (summary.rollbackOccurred) parts.push('  ROLLBACK occurred.');
  return parts.join('\n');
};

export const shouldSummarizeToolBatch = (calls: ToolCall[], tokenBudget?: number): boolean => {
  if (calls.length >= 3) return true;
  if (tokenBudget !== undefined && tokenBudget < 2000) return true;
  return false;
};
