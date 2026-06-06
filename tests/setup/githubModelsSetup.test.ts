import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {applySetupProfile} from '../../src/setup/setup.js';

describe('GitHub Models setup profile', () => {
  const originalHome = process.env.HOME;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-gh-home-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-gh-proj-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('saves a runnable GitHub Models config and survives reload', async () => {
    const store = new ConfigStore(cwd);
    const status = await applySetupProfile(store, {provider: 'github-models'});

    expect(status.defaultProvider).toBe('github-models');
    expect(status.defaultModel).toBe('openai/gpt-4.1');

    const reloaded = await new ConfigStore(cwd).load();
    expect(reloaded.effective.defaultProvider).toBe('github-models');
    expect(reloaded.effective.defaultModel).toBe('openai/gpt-4.1');
    expect(reloaded.effective.baseUrls['github-models']).toBe('https://models.github.ai/inference');
    expect(reloaded.effective.apiKeyEnvNames['github-models']).toBe('GITHUB_TOKEN');
  });

  it('still supports anthropic, openai, groq and mock profiles', async () => {
    const store = new ConfigStore(cwd);
    expect((await applySetupProfile(store, {provider: 'anthropic'})).defaultProvider).toBe('anthropic');
    expect((await applySetupProfile(store, {provider: 'openai'})).defaultProvider).toBe('openai');
    expect((await applySetupProfile(store, {provider: 'groq'})).defaultProvider).toBe('groq');
    const mock = await applySetupProfile(store, {provider: 'mock'});
    expect(mock.defaultProvider).toBe('mock');
    expect(mock.localOnly).toBe(true);
  });
});

describe('GitHub Models setup next-steps env consistency', () => {
  const originalHome = process.env.HOME;
  const originalToken = process.env.GITHUB_TOKEN;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-gh-home2-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-gh-proj2-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it('reports ready when GITHUB_TOKEN is present and never prints the full token', async () => {
    process.env.GITHUB_TOKEN = 'github_pat_SUPERSECRETVALUE1234567890';
    const status = await applySetupProfile(new ConfigStore(cwd), {provider: 'github-models'});
    const text = status.nextSteps.join('\n');
    expect(text).toContain('GITHUB_TOKEN detected');
    expect(text).toContain('configured and ready');
    expect(text).not.toContain('Export GITHUB_TOKEN');
    expect(text).not.toContain('SUPERSECRETVALUE');
  });

  it('asks to export GITHUB_TOKEN when it is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    const status = await applySetupProfile(new ConfigStore(cwd), {provider: 'github-models'});
    const text = status.nextSteps.join('\n');
    expect(text).toContain('Export GITHUB_TOKEN');
    expect(text).toContain('not ready');
  });
});
