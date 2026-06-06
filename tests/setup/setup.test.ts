import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {applySetupProfile, formatSetupStatus, getSetupStatus, resetSetup} from '../../src/setup/setup.js';

describe('first-run setup', () => {
  const originalHome = process.env.HOME;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-setup-home-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-setup-project-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('detects missing setup and creates a no-key mock profile', async () => {
    const store = new ConfigStore(cwd);

    expect((await getSetupStatus(store)).configExists).toBe(false);
    const status = await applySetupProfile(store, {provider: 'mock'});

    expect(status.configExists).toBe(true);
    expect(status.defaultProvider).toBe('mock');
    expect(status.defaultModel).toBe('mock-coder');
    expect(status.localOnly).toBe(true);
    expect(formatSetupStatus(status)).toContain('Provider/model: mock/mock-coder');
  });

  it('shows Ollama hints without storing secrets', async () => {
    const store = new ConfigStore(cwd);
    const status = await applySetupProfile(store, {local: true});

    expect(status.defaultProvider).toBe('ollama');
    expect(status.nextSteps.join('\n')).toContain('ollama serve');
    expect(JSON.stringify(await store.readUserConfig())).not.toContain('sk-');
  });

  it('supports dry-run setup reset', async () => {
    const store = new ConfigStore(cwd);
    await applySetupProfile(store, {provider: 'mock'});

    const reset = await resetSetup(store, {dryRun: true});
    expect(reset.dryRun).toBe(true);
    expect(reset.deleted).toBe(false);
    expect((await getSetupStatus(store)).configExists).toBe(true);
  });
});
