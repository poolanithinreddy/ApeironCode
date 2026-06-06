import type {ToolCallRecord} from './types.js';

export interface IterationSummary {
  iteration: number;
  filesChanged: string[];
  filesRead: string[];
  commandsRun: string[];
  toolsCalled: string[];
  newInformationGained: boolean;
  errorsEncountered: number;
  timestamp: string;
}

export interface OverallProgress {
  totalIterations: number;
  totalFilesChanged: number;
  totalFilesRead: number;
  totalCommandsRun: number;
  uniqueToolsCalled: string[];
  lastMeaningfulProgressIteration: number;
  stalled: boolean;
  stalledReason?: string;
}

const CHANGE_TOOLS = new Set(['edit_file', 'patch_file', 'write_file', 'revert_patch']);
const READ_TOOLS = new Set(['read_file', 'file_info', 'list_files', 'glob', 'grep', 'project_tree']);
const COMMAND_TOOLS = new Set(['run_command', 'test_runner', 'lint_runner', 'build_runner']);

const asString = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;

const signatureFor = (toolCall: ToolCallRecord): string =>
  `${toolCall.toolName}:${JSON.stringify(toolCall.input)}:${toolCall.error ?? toolCall.result?.summary ?? ''}`;

const hasUsefulResult = (toolCall: ToolCallRecord): boolean => {
  if (toolCall.status !== 'success') {
    return false;
  }
  const output = `${toolCall.result?.summary ?? ''}\n${toolCall.result?.output ?? ''}`.trim();
  return output.length > 0;
};

export class LoopProgressTracker {
  private readonly summaries: IterationSummary[] = [];
  private readonly seenFilesChanged = new Set<string>();
  private readonly seenFilesRead = new Set<string>();
  private readonly seenCommandsRun = new Set<string>();
  private readonly seenUsefulResults = new Set<string>();
  private lastProgressIteration = 0;

  record(iteration: number, toolCalls: ToolCallRecord[]): IterationSummary {
    const filesChanged: string[] = [];
    const filesRead: string[] = [];
    const commandsRun: string[] = [];
    const toolsCalled = toolCalls.map((toolCall) => toolCall.toolName);
    let newInformationGained = false;

    for (const toolCall of toolCalls) {
      const inputPath = asString(toolCall.input.path);
      const resultPath = asString(toolCall.result?.metadata?.filePath);
      const command = asString(toolCall.input.command) ?? asString(toolCall.result?.metadata?.command);

      if (CHANGE_TOOLS.has(toolCall.toolName)) {
        const filePath = resultPath ?? inputPath;
        if (filePath && !this.seenFilesChanged.has(filePath)) {
          this.seenFilesChanged.add(filePath);
          filesChanged.push(filePath);
        }
      }

      if (READ_TOOLS.has(toolCall.toolName)) {
        const filePath = resultPath ?? inputPath ?? asString(toolCall.input.pattern) ?? asString(toolCall.input.query);
        if (filePath && !this.seenFilesRead.has(filePath)) {
          this.seenFilesRead.add(filePath);
          filesRead.push(filePath);
        }
      }

      if (COMMAND_TOOLS.has(toolCall.toolName) && command && !this.seenCommandsRun.has(command)) {
        this.seenCommandsRun.add(command);
        commandsRun.push(command);
      }

      const resultSignature = signatureFor(toolCall);
      if (hasUsefulResult(toolCall) && !this.seenUsefulResults.has(resultSignature)) {
        this.seenUsefulResults.add(resultSignature);
        newInformationGained = true;
      }
    }

    const errorsEncountered = toolCalls.filter((toolCall) => toolCall.status === 'error').length;
    const meaningfulProgress = filesChanged.length > 0
      || filesRead.length > 0
      || commandsRun.length > 0
      || newInformationGained;

    if (meaningfulProgress) {
      this.lastProgressIteration = iteration;
    }

    const summary: IterationSummary = {
      commandsRun,
      errorsEncountered,
      filesChanged,
      filesRead,
      iteration,
      newInformationGained,
      timestamp: new Date().toISOString(),
      toolsCalled,
    };
    this.summaries.push(summary);
    return summary;
  }

  isStalled(lastN: number): boolean {
    if (lastN <= 0 || this.summaries.length < lastN) {
      return false;
    }
    return this.summaries.slice(-lastN).every((summary) =>
      summary.filesChanged.length === 0
      && summary.commandsRun.length === 0
      && summary.filesRead.length === 0
      && !summary.newInformationGained);
  }

  stalledReason(): string {
    if (this.summaries.length === 0) {
      return 'No loop iterations have completed.';
    }

    const recent = this.summaries.slice(-3);
    const repeatedTools = recent.flatMap((summary) => summary.toolsCalled);
    const uniqueTools = Array.from(new Set(repeatedTools));
    if (uniqueTools.length === 1 && repeatedTools.length > 1) {
      return `Repeated ${uniqueTools[0]} without new files, commands, edits, or useful results.`;
    }

    if (recent.every((summary) => summary.errorsEncountered > 0)) {
      return 'Recent iterations only encountered tool errors and produced no new task information.';
    }

    return 'Recent iterations produced no new files, commands, edits, or useful results.';
  }

  totalProgress(): OverallProgress {
    const uniqueToolsCalled = Array.from(new Set(this.summaries.flatMap((summary) => summary.toolsCalled))).sort();
    const stalled = this.isStalled(3);
    return {
      lastMeaningfulProgressIteration: this.lastProgressIteration,
      stalled,
      stalledReason: stalled ? this.stalledReason() : undefined,
      totalCommandsRun: this.seenCommandsRun.size,
      totalFilesChanged: this.seenFilesChanged.size,
      totalFilesRead: this.seenFilesRead.size,
      totalIterations: this.summaries.length,
      uniqueToolsCalled,
    };
  }

  reset(): void {
    this.summaries.length = 0;
    this.seenFilesChanged.clear();
    this.seenFilesRead.clear();
    this.seenCommandsRun.clear();
    this.seenUsefulResults.clear();
    this.lastProgressIteration = 0;
  }
}
