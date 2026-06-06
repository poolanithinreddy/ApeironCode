export type CliColorMode = 'auto' | 'dark' | 'light' | 'no-color';
export type CliColorToken =
  | 'accent'
  | 'blue'
  | 'border'
  | 'danger'
  | 'muted'
  | 'success'
  | 'text'
  | 'violet'
  | 'warning';

export interface CliThemeOptions {
  colorMode?: CliColorMode;
  env?: Record<string, string | undefined>;
  streamIsTTY?: boolean;
}

export interface CliTheme {
  colorsEnabled: boolean;
  mode: CliColorMode;
}

const ANSI: Record<CliColorToken, [number, number]> = {
  accent: [96, 39],
  blue: [94, 39],
  border: [90, 39],
  danger: [91, 39],
  muted: [90, 39],
  success: [92, 39],
  text: [97, 39],
  violet: [95, 39],
  warning: [93, 39],
};

export const APEIRONCODE_THEME = {
  background: '#080A0F',
  surface: '#111722',
  elevatedSurface: '#151D2B',
  border: '#243244',
  text: '#F4F7FB',
  secondaryText: '#A6B3C2',
  mutedText: '#687586',
  accentTeal: '#4DE1C1',
  accentBlue: '#6AA9FF',
  accentViolet: '#9B8CFF',
  warningAmber: '#F6C177',
  successGreen: '#8BE28B',
  errorRed: '#FF6B6B',
} as const;

export const supportsColorLevel = (env: Record<string, string | undefined> = process.env): 0 | 1 | 2 | 3 => {
  if (env.NO_COLOR || env.TERM === 'dumb') return 0;
  if (env.FORCE_COLOR === '0') return 0;
  if (env.FORCE_COLOR === '1') return 1;
  if (env.FORCE_COLOR === '2') return 2;
  if (env.FORCE_COLOR === '3') return 3;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 3;
  if ((env.TERM ?? '').includes('256color')) return 2;
  return 1;
};

export const getCliTheme = (options: CliThemeOptions = {}): CliTheme => {
  const mode = options.colorMode ?? 'auto';
  const env = options.env ?? process.env;
  const streamIsTTY = options.streamIsTTY ?? process.stdout.isTTY === true;
  const colorsEnabled = mode !== 'no-color' && !env.CI && streamIsTTY && supportsColorLevel(env) > 0;
  return {colorsEnabled, mode};
};

export const colorize = (
  text: string,
  token: CliColorToken,
  options: CliThemeOptions = {},
): string => {
  if (!getCliTheme(options).colorsEnabled) return text;
  const [open, close] = ANSI[token];
  return `\u001B[${open}m${text}\u001B[${close}m`;
};

export const stripAnsi = (text: string): string =>
  text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

export const safeTerminalWidth = (width?: number): number => {
  const candidate = Number.isFinite(width) ? Number(width) : process.stdout.columns;
  return Math.max(40, Math.min(120, Math.floor(candidate || 80)));
};
