import {describe, expect, it} from 'vitest';

import {colorize, getCliTheme, safeTerminalWidth, stripAnsi, supportsColorLevel} from '../../src/ui/theme.js';

describe('CLI theme', () => {
  it('disables color for NO_COLOR and strips ANSI', () => {
    expect(supportsColorLevel({NO_COLOR: '1'})).toBe(0);
    const colored = colorize('hello', 'accent', {env: {FORCE_COLOR: '1'}, streamIsTTY: true});
    expect(stripAnsi(colored)).toBe('hello');
    expect(colorize('hello', 'accent', {colorMode: 'no-color'})).toBe('hello');
  });

  it('uses safe terminal widths', () => {
    expect(safeTerminalWidth(12)).toBe(40);
    expect(safeTerminalWidth(200)).toBe(120);
  });

  it('keeps CI no-color by default', () => {
    expect(getCliTheme({env: {CI: '1'}, streamIsTTY: true}).colorsEnabled).toBe(false);
  });
});
