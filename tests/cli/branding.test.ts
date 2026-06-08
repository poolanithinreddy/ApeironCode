import {describe, expect, it, vi} from 'vitest';

import {buildProgram} from '../../src/cli/commands.js';
import {APP_DIR_NAME, LEGACY_APP_DIR_NAME, NEW_APP_DIR_NAME} from '../../src/utils/paths.js';

const createProgram = () => {
  const handlers = new Proxy({}, {
    get() {
      return vi.fn(() => Promise.resolve());
    },
  });
  return buildProgram(handlers as never);
};

describe('Phase 15A brand migration', () => {
  it('CLI program is named apeironcode', () => {
    const program = createProgram();
    expect(program.name()).toBe('apeironcode');
  });

  it('CLI description references the ApeironCode brand', () => {
    const program = createProgram();
    expect(program.description()).toContain('ApeironCode');
  });

  it('help output advertises the ApeironCode product name', () => {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({writeErr: () => undefined, writeOut: () => undefined});
    expect(program.helpInformation()).toContain('ApeironCode');
  });

  it('paths utility exposes both legacy and new project directory names', () => {
    // Primary directory is the ApeironCode-branded one; the legacy
    // `.opencode-agent` name is preserved for backward compatibility.
    expect(APP_DIR_NAME).toBe('.apeironcode-agent');
    expect(LEGACY_APP_DIR_NAME).toBe('.opencode-agent');
    // Deprecated compatibility alias still points to the new primary name.
    expect(NEW_APP_DIR_NAME).toBe('.apeironcode-agent');
  });

  it('package.json exposes both the apeironcode and legacy opencode binaries', async () => {
    const pkg = await import('../../package.json', {with: {type: 'json'}});
    const data = (pkg as {default: {name: string; bin: Record<string, string>}}).default;
    expect(data.name).toBe('apeironcode-agent');
    expect(data.bin).toHaveProperty('apeironcode');
    expect(data.bin).toHaveProperty('opencode');
  });
});
