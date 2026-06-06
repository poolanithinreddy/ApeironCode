import {colorize, safeTerminalWidth, stripAnsi, type CliThemeOptions} from './theme.js';

export interface StatusLineState {
  brainActive?: boolean;
  bridgeConnected?: boolean;
  mode?: string;
  model?: string;
  permissionMode?: string;
  provider?: string;
  task?: string;
  tokenBudget?: string;
}

export interface StatusLineOptions extends CliThemeOptions {
  width?: number;
}

const redact = (text: string): string =>
  text.replace(/(sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|Bearer\s+\S+|[A-Z0-9_]*(?:KEY|TOKEN|SECRET)=\S+)/giu, '[REDACTED]');

const fit = (text: string, width: number): string => {
  const clean = redact(text);
  if (stripAnsi(clean).length <= width) return clean;
  return `${clean.slice(0, Math.max(0, width - 1))}…`;
};

export const renderStatusLine = (status: StatusLineState, options: StatusLineOptions = {}): string => {
  const segments = [
    `${status.provider ?? 'provider?'}/${status.model ?? 'model?'}`,
    `perm:${status.permissionMode ?? 'ask'}`,
    status.brainActive ? 'brain:on' : 'brain:off',
    status.tokenBudget ? `tokens:${status.tokenBudget}` : undefined,
    status.task ? `task:${status.task}` : undefined,
    status.bridgeConnected ? 'bridge:on' : 'bridge:off',
    status.mode ?? 'idle',
  ].filter((segment): segment is string => Boolean(segment));
  return fit(colorize(`ApeironCode  ${segments.join('  |  ')}`, 'muted', options), safeTerminalWidth(options.width));
};

export interface CompactStatusState {
  appName?: string;
  mode?: string;
  model?: string;
  provider?: string;
  status?: string;
  workspace?: string;
}

const STATUS_LABELS: Record<string, string> = {
  applying: 'applying',
  approval: 'awaiting approval',
  awaiting_approval: 'awaiting approval',
  done: 'ready',
  error: 'error',
  idle: 'ready',
  planning: 'planning',
  ready: 'ready',
  running: 'running',
  thinking: 'thinking',
  validating: 'validating',
  working: 'working',
};

/** Normalize an internal status to a calm, user-facing label. */
export const normalizeStatusLabel = (status?: string): string => {
  const key = (status ?? '').toLowerCase().trim().replace(/\s+/gu, '_');
  return STATUS_LABELS[key] ?? (status?.trim() || 'ready');
};

/**
 * Compact premium status line for normal mode:
 *   ApeironCode · openai/gpt-4o · calculator-test · ready
 * Low-level internals (brain/bridge/tokens/perm) stay in renderStatusLine,
 * which debug/verbose mode uses.
 */
export const renderCompactStatusLine = (state: CompactStatusState, options: StatusLineOptions = {}): string => {
  const providerModel = state.provider === 'mock'
    ? 'mock · testing only'
    : `${state.provider ?? 'provider?'}/${state.model ?? 'model?'}`;
  const segments = [state.appName ?? 'ApeironCode', providerModel, state.workspace, normalizeStatusLabel(state.status)];
  const mode = state.mode?.toLowerCase().trim();
  if (mode && mode !== 'chat' && mode !== 'idle') {
    segments.push(mode);
  }
  const line = segments.filter((segment): segment is string => Boolean(segment)).join(' · ');
  return fit(colorize(line, 'muted', options), safeTerminalWidth(options.width));
};

export const renderPromptHint = (context: Pick<StatusLineState, 'mode' | 'brainActive'>, options: StatusLineOptions = {}): string => {
  const mode = context.mode ?? 'idle';
  const hint = context.brainActive
    ? `Brain ready - ${mode}. Try /help, /model, or describe the next change.`
    : `${mode}. Try: build an app, fix tests, explain this repo, /help`;
  return fit(colorize(hint, 'accent', options), safeTerminalWidth(options.width));
};
