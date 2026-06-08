import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {formatDoctorReport, runDoctor, runProviderSmokeTest} from '../../src/diagnostics/doctor.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import type {ModelProvider, ProviderStreamChunk} from '../../src/providers/types.js';

class ObjectMessageProvider implements ModelProvider {
  readonly displayName = 'Object Message';
  readonly name = 'object-message';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = false;
  readonly nativeToolFormat = 'anthropic' as const;

  listModels(): Promise<string[]> {
    return Promise.resolve(['object-message']);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async *stream(): AsyncGenerator<ProviderStreamChunk> {
    const message = JSON.stringify({status: 'ok', summary: {next: 'continue'}});
    for (const token of message.split(/(\s+)/)) {
      if (token) {
        yield {
          type: 'token',
          token,
        };
      }
    }
    yield {
      type: 'done',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }
}

describe('doctor diagnostics', () => {
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-doctor-'));
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-doctor-home-'));
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('passes smoke checks for the mock provider', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({defaultModel: 'mock-coder', defaultProvider: 'mock'});
    const config = await store.load();
    const registry = new ProviderRegistry();

    const smoke = await runProviderSmokeTest({config, providerRegistry: registry});
    expect(smoke.status).toBe('pass');
    expect(smoke.confidence).toBe('high');

    const report = await runDoctor({
      config,
      cwd: projectDir,
      providerRegistry: registry,
      testProviderConnectivity: true,
    });
    expect(formatDoctorReport(report)).toContain('Provider connectivity');
    expect(formatDoctorReport(report)).toContain('Provider capabilities');
    expect(formatDoctorReport(report)).toContain('LSP servers');
    expect(formatDoctorReport(report)).toContain('LSP sessions');
    expect(formatDoctorReport(report)).toContain('LSP cache');
    expect(formatDoctorReport(report)).toContain('Code intelligence');
    expect(formatDoctorReport(report)).toContain('OS sandboxing');
    expect(formatDoctorReport(report)).toContain('Per-subagent credential isolation');
    expect(formatDoctorReport(report)).toContain('Cloud/distributed execution');
    expect(formatDoctorReport(report)).toContain('github connector');
    expect(formatDoctorReport(report)).toContain('linear connector');
    expect(formatDoctorReport(report)).toContain('jira connector');
    expect(formatDoctorReport(report)).toContain('slack connector');
    expect(formatDoctorReport(report)).not.toContain('fake-token-value');

    const formatted = formatDoctorReport(report);
    expect(formatted).toContain('Safety: shell parser');
    expect(formatted).toContain('Safety: permission mode');
    expect(formatted).toContain('Safety: sandbox fallback policy');
    expect(formatted).toContain('Safety: protected path policy');
    expect(formatted).toContain('Safety: secret egress detection');
    expect(formatted).toContain('Safety: project trust');
    expect(formatted).toContain('Safety: hook v2');
    expect(formatted).toContain('Safety: hook v2 runtime producers');
    expect(formatted).toContain('Safety: completion gates');
    expect(formatted).toContain('Safety: tool batch summary');
    expect(formatted).toContain('Safety: context viewer');
    expect(formatted).toContain('Safety: compaction explanation');
    expect(formatted).toContain('Safety: TODO-marker gate');
    // No real secret-like values should appear in the safety section
    expect(formatted).not.toMatch(/[A-Za-z0-9]{40,}/);
  });

  it('skips provider smoke when credentials are missing in non-strict mode', async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const store = new ConfigStore(projectDir);
      await store.patchUserConfig({defaultModel: 'gpt-4.1-mini', defaultProvider: 'openai'});
      const config = await store.load();
      const registry = new ProviderRegistry();

      const smoke = await runProviderSmokeTest({config, providerRegistry: registry});
      expect(smoke.status).toBe('skip');
      expect(smoke.confidence).toBe('none');
    } finally {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it('fails provider smoke when credentials are missing in strict mode', async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const store = new ConfigStore(projectDir);
      await store.patchUserConfig({defaultModel: 'gpt-4.1-mini', defaultProvider: 'openai'});
      const config = await store.load();
      const registry = new ProviderRegistry();

      const smoke = await runProviderSmokeTest({
        config,
        providerRegistry: registry,
        strictProviderConnectivity: true,
      });
      expect(smoke.status).toBe('fail');
      expect(smoke.confidence).toBe('none');
    } finally {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it('formats object-like provider smoke responses without leaking [object Object]', async () => {
    const store = new ConfigStore(projectDir);
    await store.patchUserConfig({defaultModel: 'mock-coder', defaultProvider: 'mock'});
    const config = await store.load();
    const registry = new ProviderRegistry();
    registry.register('mock', () => new ObjectMessageProvider());

    const smoke = await runProviderSmokeTest({config, providerRegistry: registry});

    // Any non-empty assistant content is a PASS (Phase 16I.6): the provider,
    // model and auth all work. The detail must still be safe (no raw object).
    expect(smoke.status).toBe('pass');
    expect(smoke.detail).toContain('"status": "ok"');
    expect(smoke.detail).not.toContain('[object Object]');
  });
});
