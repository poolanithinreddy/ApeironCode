import path from 'node:path';
import {formatBrandName, renderApeironLogo} from './brand.js';
import {colorize, safeTerminalWidth, stripAnsi, type CliThemeOptions} from './theme.js';

export interface WelcomeDashboardContext {
  accountStatus?: string;
  activeTasks?: number;
  bridgeStatus?: string;
  brainStatus?: string;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  provider?: string;
  showTips?: boolean;
  showWhatsNew?: boolean;
  taskCount?: number;
  username?: string;
  version?: string;
}

export interface WelcomeDashboardModel {
  accountStatus: string;
  activeTasks: number;
  bridgeStatus: string;
  brainStatus: string;
  commandHint: string;
  greeting: string;
  modelStatus: string;
  permissionMode: string;
  product: string;
  taskCount: number;
  tips: string[];
  version: string;
  whatsNew: string[];
  workspace: string;
}

export interface DashboardRenderOptions extends CliThemeOptions {
  width?: number;
}

const SECRET_RE = /(sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|xoxb-[A-Za-z0-9-]+|Bearer\s+\S+|[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)=\S+)/giu;

const redact = (text: string): string => text.replace(SECRET_RE, '[REDACTED]');

const ellipsize = (text: string, width: number): string => {
  const clean = redact(text);
  if (clean.length <= width) return clean;
  return `${clean.slice(0, Math.max(0, width - 1))}…`;
};

const shortenPath = (cwd: string | undefined): string => {
  if (!cwd) return 'workspace unavailable';
  const home = process.env.HOME;
  const display = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const parts = display.split(path.sep).filter(Boolean);
  return parts.length > 4 ? `…/${parts.slice(-3).join('/')}` : display;
};

export const buildWelcomeDashboardModel = (context: WelcomeDashboardContext): WelcomeDashboardModel => {
  const provider = context.provider || 'not configured';
  const model = context.model || 'choose a model';
  return {
    accountStatus: context.accountStatus ?? 'local-first',
    activeTasks: context.activeTasks ?? 0,
    bridgeStatus: context.bridgeStatus ?? 'disconnected',
    brainStatus: context.brainStatus ?? 'not initialized',
    commandHint: 'Try: build an app, fix tests, explain this repo, /help',
    greeting: context.username ? `Welcome back, ${context.username}` : 'Welcome back',
    modelStatus: `${provider}/${model}`,
    permissionMode: context.permissionMode ?? 'ask',
    product: `${formatBrandName()} - local-first coding agent OS`,
    taskCount: context.taskCount ?? 0,
    tips: context.showTips === false ? [] : [
      'Use Project Brain for long-running app work.',
      'Use /help for commands and /model to switch providers.',
      'Approvals stay on for risky writes by default.',
    ],
    version: context.version ?? 'dev',
    whatsNew: context.showWhatsNew === false ? [] : [
      'Premium CLI and VS Code UI polish.',
      'Runtime, memory, context, and token intelligence are active.',
    ],
    workspace: shortenPath(context.cwd),
  };
};

const row = (label: string, value: string, width: number): string =>
  `  ${label.padEnd(14)} ${ellipsize(value, Math.max(8, width - 19))}`;

const box = (lines: string[], width: number, options: DashboardRenderOptions): string => {
  const inner = width - 2;
  const top = colorize(`┌${'─'.repeat(inner)}┐`, 'border', options);
  const bottom = colorize(`└${'─'.repeat(inner)}┘`, 'border', options);
  const body = lines.map((line) => {
    const plain = stripAnsi(line);
    const clipped = plain.length > inner ? `${line.slice(0, inner - 1)}…` : line;
    const pad = Math.max(0, inner - stripAnsi(clipped).length);
    return `${colorize('│', 'border', options)}${clipped}${' '.repeat(pad)}${colorize('│', 'border', options)}`;
  });
  return [top, ...body, bottom].join('\n');
};

export interface CompactHomeOptions {
  version?: string;
  workspacePath?: string;
  provider?: string;
  model?: string;
  projectBrainStatus?: string;
  mode?: string;
}

/**
 * Renders a compact home screen (≤15 lines) for default interactive startup.
 * The full dashboard is still accessible via /dashboard.
 */
export const formatCompactHome = (options: CompactHomeOptions = {}): string => {
  const provider = options.provider && options.provider !== 'mock' ? options.provider : 'not configured';
  const model = options.model && options.model !== 'mock-coder' ? options.model : 'not configured';
  const modelStr = provider === 'not configured' ? 'not configured' : `${provider}/${model}`;
  const workspace = redact(shortenPath(options.workspacePath));
  const brainStatus = options.projectBrainStatus ?? 'inactive';
  const mode = options.mode ?? 'chat';
  const version = options.version ?? 'dev';

  const lines: string[] = [
    `ApeironCode v${version}  |  ${mode}`,
    `  Workspace : ${workspace}`,
    `  Model     : ${modelStr}`,
    `  Brain     : ${brainStatus}`,
    '',
    `  Type a prompt to start, or /help for commands.`,
  ];

  const isMockConfig = provider === 'not configured' || model === 'not configured';
  if (isMockConfig) {
    lines.push(`  Run \`apeironcode setup\` to configure a real provider.`);
  }

  return lines.join('\n');
};

export const renderWelcomeDashboard = (
  model: WelcomeDashboardModel,
  options: DashboardRenderOptions = {},
): string => {
  const width = safeTerminalWidth(options.width);
  const contentWidth = width - 4;
  const logo = renderApeironLogo({...options, width}).split('\n');
  const lines: string[] = [
    ...logo.map((line) => `  ${line}`),
    `  ${colorize(model.product, 'text', options)}  ${colorize(`v${model.version}`, 'muted', options)}`,
    '',
    row('Workspace', model.workspace, contentWidth),
    row('Model', model.modelStatus, contentWidth),
    row('Permissions', model.permissionMode, contentWidth),
    row('Project Brain', model.brainStatus, contentWidth),
    row('Bridge', model.bridgeStatus, contentWidth),
    row('Tasks', `${model.activeTasks} active / ${model.taskCount} total`, contentWidth),
    row('Account', model.accountStatus, contentWidth),
    '',
    `  ${colorize(model.commandHint, 'accent', options)}`,
  ];
  if (model.tips.length > 0) lines.push('', '  Tips', ...model.tips.map((tip) => `  - ${ellipsize(tip, contentWidth - 4)}`));
  if (model.whatsNew.length > 0) lines.push('', "  What's new", ...model.whatsNew.map((item) => `  - ${ellipsize(item, contentWidth - 4)}`));
  return box(lines, width, options);
};
