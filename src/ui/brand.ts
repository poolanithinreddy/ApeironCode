import {colorize, safeTerminalWidth, type CliThemeOptions} from './theme.js';

export interface LogoOptions extends CliThemeOptions {
  variant?: 'compact' | 'wide';
  width?: number;
}

export const formatBrandName = (): string => 'ApeironCode';

export const renderApeironLogo = (options: LogoOptions = {}): string => {
  const variant = options.variant ?? (safeTerminalWidth(options.width) >= 76 ? 'wide' : 'compact');
  const mark = variant === 'wide'
    ? [
        '    APEIRONCODE',
        ' local-first coding agent OS',
      ].join('\n')
    : 'APEIRONCODE';
  return colorize(mark, 'accent', options);
};
