import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';

describe('ConfigStore', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-config-'));
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-home-'));
    await fs.mkdir(path.join(projectDir, '.apeironcode-agent'), {recursive: true});
    await fs.writeFile(path.join(projectDir, '.opencodeignore'), 'generated\n', 'utf8');
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('merges user config and project ignore patterns', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({defaultProvider: 'openrouter'});

    const loaded = await store.load();

    expect(loaded.effective.defaultProvider).toBe('openrouter');
    expect(loaded.effective.ignoredPaths).toContain('generated');
    expect(loaded.ignorePatterns).toContain('node_modules');
    expect(loaded.ignorePatterns).toContain('generated');
  });

  it('merges plugin settings without duplicating directories', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({
      plugins: {
        directories: ['plugins', 'plugins'],
        disabled: ['legacy-plugin'],
      },
    });

    const loaded = await store.load();

    expect(loaded.effective.plugins.directories).toEqual(['plugins']);
    expect(loaded.effective.plugins.disabled).toEqual(['legacy-plugin']);
  });

  it('loads UI defaults and no-color theme', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({ui: {
      compact: false,
      showTips: true,
      showWhatsNew: true,
      theme: 'no-color',
      welcome: false,
    }});

    const loaded = await store.load();

    expect(loaded.effective.ui?.theme).toBe('no-color');
    expect(loaded.effective.ui?.welcome).toBe(false);
    expect(loaded.effective.ui?.showTips).toBe(true);
  });
});
