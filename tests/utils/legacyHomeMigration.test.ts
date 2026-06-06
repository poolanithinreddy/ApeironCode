import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {getGlobalConfigPath, migrateLegacyAppHome} from '../../src/utils/paths.js';

describe('legacy .opencode-agent -> .apeironcode-agent migration', () => {
  const originalHome = process.env.HOME;
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'apeiron-mig-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('copies legacy config into the ApeironCode home and uses it for new paths', () => {
    const legacyDir = path.join(home, '.opencode-agent');
    fs.mkdirSync(legacyDir, {recursive: true});
    fs.writeFileSync(
      path.join(legacyDir, 'config.json'),
      JSON.stringify({defaultProvider: 'github-models', defaultModel: 'openai/gpt-4.1'}),
    );

    expect(migrateLegacyAppHome()).toBe(true);

    const newConfig = path.join(home, '.apeironcode-agent', 'config.json');
    expect(fs.existsSync(newConfig)).toBe(true);
    // Legacy preserved for rollback (non-destructive).
    expect(fs.existsSync(path.join(legacyDir, 'config.json'))).toBe(true);
    // Subsequent global config path is ApeironCode-first.
    expect(getGlobalConfigPath()).toBe(newConfig);
    const parsed = JSON.parse(fs.readFileSync(newConfig, 'utf8')) as {defaultProvider: string};
    expect(parsed.defaultProvider).toBe('github-models');
  });

  it('is a no-op when the ApeironCode home already exists', () => {
    fs.mkdirSync(path.join(home, '.apeironcode-agent'), {recursive: true});
    fs.mkdirSync(path.join(home, '.opencode-agent'), {recursive: true});
    expect(migrateLegacyAppHome()).toBe(false);
  });

  it('is a no-op when there is no legacy home', () => {
    expect(migrateLegacyAppHome()).toBe(false);
  });
});
