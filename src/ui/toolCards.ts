import {colorize, safeTerminalWidth, type CliThemeOptions} from './theme.js';

export interface CardOptions extends CliThemeOptions {
  width?: number;
}

const SECRET_RE = /(sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|xoxb-[A-Za-z0-9-]+|Bearer\s+\S+|[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)=\S+)/giu;
const redact = (text: string): string => text.replace(SECRET_RE, '[REDACTED]');

const trim = (text: string, width: number): string => {
  const clean = redact(text).replace(/\s+/g, ' ').trim();
  return clean.length <= width ? clean : `${clean.slice(0, Math.max(0, width - 1))}…`;
};

const card = (title: string, lines: string[], token: 'accent' | 'blue' | 'danger' | 'success' | 'violet' | 'warning', options: CardOptions): string => {
  const width = safeTerminalWidth(options.width);
  const head = colorize(`[${title}]`, token, options);
  return [head, ...lines.map((line) => `  ${trim(line, width - 2)}`)].join('\n');
};

export const renderToolStartCard = (input: {toolName: string; summary?: string}, options: CardOptions = {}): string =>
  card('tool start', [input.toolName, input.summary ?? 'running'], 'accent', options);

export const renderToolResultCard = (input: {ok: boolean; summary?: string; output?: string; toolName: string}, options: CardOptions = {}): string =>
  card(input.ok ? 'tool done' : 'tool failed', [input.toolName, input.summary ?? '', input.output ?? ''].filter(Boolean), input.ok ? 'success' : 'danger', options);

export const renderPermissionCard = (input: {action: string; reason?: string; risk?: string}, options: CardOptions = {}): string =>
  card('permission required', [`risk: ${input.risk ?? 'unknown'}`, input.action, input.reason ?? 'approval required'], 'warning', options);

export const renderDiffSummaryCard = (input: {files: number; insertions?: number; deletions?: number; summary?: string}, options: CardOptions = {}): string =>
  card('diff summary', [`files: ${input.files}`, `+${input.insertions ?? 0} / -${input.deletions ?? 0}`, input.summary ?? ''], 'blue', options);

export const renderTaskCard = (input: {status: string; title: string; id?: string}, options: CardOptions = {}): string =>
  card('task', [input.id ? `id: ${input.id}` : '', `${input.status}: ${input.title}`].filter(Boolean), 'accent', options);

export const renderBrainContextCard = (input: {status: string; files?: number; tokens?: number}, options: CardOptions = {}): string =>
  card('project brain', [input.status, `files: ${input.files ?? 0}`, `tokens: ${input.tokens ?? 0}`], 'violet', options);

export const renderErrorCard = (input: {message: string; nextStep?: string}, options: CardOptions = {}): string =>
  card('error', [input.message, input.nextStep ?? 'check the command output and retry'], 'danger', options);

/* --------------------------------------------------------------------------
 * Phase 18B: compact tool cards (single-line in normal mode).
 *
 * Normal mode renders one calm line per tool call:
 *   ✓ Read calculator/index.html
 *   ✓ Edit calculator/styles.css  +42/-12  · /revert e1
 *   ✓ Run npm run build
 *   ✗ Read file  read_file requires path
 * Full diffs, raw args/results, and the `[builtin]` source tag are debug-only
 * (ToolCard renders them only when `verbose`).
 * ------------------------------------------------------------------------ */

interface ToolCallLike {
  toolName: string;
  status: string;
  error?: string;
  input?: Record<string, unknown> | null;
  result?: {summary?: string; metadata?: Record<string, unknown> | null} | null;
}

export interface ToolCardView {
  diffSummary: string;
  editId: string | null;
  errorLine: string;
  label: string;
  ok: boolean;
  running: boolean;
  symbol: string;
  target: string;
}

const HUMAN_TOOL_NAMES: Record<string, string> = {
  build_runner: 'Build',
  command_output: 'Output',
  create_file: 'Create',
  delete_file: 'Delete',
  edit_file: 'Edit',
  git_diff: 'Git diff',
  git_status: 'Git status',
  list_directory: 'List',
  read_file: 'Read',
  rename_file: 'Rename',
  run_command: 'Run',
  search_files: 'Search',
  test_runner: 'Tests',
  write_file: 'Write',
};

/** Human-readable verb for a tool (write_file → Write, run_command → Run). */
export const humanizeToolName = (toolName: string): string =>
  HUMAN_TOOL_NAMES[toolName] ??
  toolName.replace(/[_:]/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const toolTarget = (toolCall: ToolCallLike): string => {
  const input = toolCall.input ?? {};
  const metadata = toolCall.result?.metadata ?? {};
  return (
    str(input.path) ??
    str(input.command) ??
    str(metadata.filePath) ??
    str(input.directory) ??
    ''
  );
};

/** Pure view model for one tool call — drives both compact and debug rendering. */
export const buildToolCardView = (toolCall: ToolCallLike): ToolCardView => {
  const running = toolCall.status === 'running';
  const ok = toolCall.status === 'success';
  const metadata = toolCall.result?.metadata ?? {};
  const added = num(metadata.addedLines);
  const removed = num(metadata.removedLines);
  const diffSummary = added !== null || removed !== null ? `+${added ?? 0}/-${removed ?? 0}` : '';
  return {
    diffSummary,
    editId: str(metadata.editId),
    errorLine: ok || running ? '' : redact((toolCall.error ?? toolCall.result?.summary ?? 'failed').replace(/\s+/gu, ' ').trim()),
    label: humanizeToolName(toolCall.toolName),
    ok,
    running,
    symbol: running ? '○' : ok ? '✓' : '✗',
    target: redact(toolTarget(toolCall)),
  };
};

/**
 * Compact single-line rendering of a tool call. Never includes a raw diff.
 * In verbose mode the edit id is shown inline; the full diff/args stay in the
 * detailed ToolCard box.
 */
export const renderToolLine = (toolCall: ToolCallLike, options: {verbose?: boolean} = {}): string => {
  const view = buildToolCardView(toolCall);
  let line = `${view.symbol} ${view.label}`;
  if (view.target) line += ` ${view.target}`;
  if (view.diffSummary) line += `  ${view.diffSummary}`;
  if (!view.ok && !view.running && view.errorLine) line += `  ${view.errorLine}`;
  if (view.editId) line += options.verbose ? `  · edit ${view.editId} (/revert ${view.editId})` : `  · /revert ${view.editId}`;
  return line;
};
