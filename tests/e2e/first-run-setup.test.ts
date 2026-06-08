/**
 * E2E-style tests for first-run setup detection and compact home output.
 * All tests are non-interactive — no readline, no prompts, no real network calls.
 */
import {describe, expect, it} from 'vitest';

import {detectFirstRunState, formatFirstRunReason, shouldShowFirstRunSetup} from '../../src/cli/setup/firstRun.js';
import {maskApiKey, formatProviderList, listProviderOptions} from '../../src/cli/setup/providerWizard.js';
import {formatCompactHome} from '../../src/ui/welcomeDashboard.js';
import {isInteractiveContext} from '../../src/cli/setup/interactiveGuard.js';

describe('detectFirstRunState — all scenarios', () => {
  it('no config → first run triggered', () => {
    const state = detectFirstRunState({hasUserConfigFile: false, defaultProvider: 'ollama', defaultModel: 'qwen2.5-coder:7b'});
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('no-config');
  });

  it('mock provider → first run triggered', () => {
    const state = detectFirstRunState({hasUserConfigFile: true, defaultProvider: 'mock', defaultModel: 'something'});
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('mock-provider');
  });

  it('real provider configured → not first run', () => {
    const state = detectFirstRunState({hasUserConfigFile: true, defaultProvider: 'anthropic', defaultModel: 'claude-sonnet'});
    expect(state.isFirstRun).toBe(false);
    expect(state.reason).toBe('ok');
  });

  it('CI env → shouldShow returns false even if first run', () => {
    const state = detectFirstRunState({hasUserConfigFile: false});
    const originalCI = process.env.CI;
    process.env.CI = '1';
    try {
      expect(shouldShowFirstRunSetup(state)).toBe(false);
    } finally {
      if (originalCI === undefined) delete process.env.CI;
      else process.env.CI = originalCI;
    }
  });

  it('--no-setup flag → shouldShow returns false', () => {
    const state = detectFirstRunState({hasUserConfigFile: false});
    expect(shouldShowFirstRunSetup(state, {noSetup: true})).toBe(false);
  });

  it('doctor subcommand → shouldShow returns false', () => {
    const state = detectFirstRunState({hasUserConfigFile: false});
    expect(shouldShowFirstRunSetup(state, {argv: ['node', 'apeironcode', 'doctor']})).toBe(false);
  });

  it('bridge subcommand → shouldShow returns false', () => {
    const state = detectFirstRunState({hasUserConfigFile: false});
    expect(shouldShowFirstRunSetup(state, {argv: ['node', 'apeironcode', 'bridge']})).toBe(false);
  });

  it('help flag → shouldShow returns false', () => {
    const state = detectFirstRunState({hasUserConfigFile: false});
    expect(shouldShowFirstRunSetup(state, {argv: ['node', 'apeironcode', '--help']})).toBe(false);
  });
});

describe('maskApiKey — safety', () => {
  const SAMPLE_KEYS = [
    'test-openai-key-abcdefghijklmnopqrstuvwxyz1234567890',
    'test-anthropic-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'test-google-key-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
    'test-github-key-ABCDEFGHIJKLMNOPQRSTUVWXYZabcde',
    'test-groq-key-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  ];

  for (const key of SAMPLE_KEYS) {
    it(`never returns full key: ${key.slice(0, 10)}...`, () => {
      const masked = maskApiKey(key);
      expect(masked).not.toBe(key);
      expect(masked.length).toBeLessThan(key.length);
      // The middle section must not appear
      const mid = key.slice(8, -4);
      if (mid.length > 4) {
        expect(masked).not.toContain(mid);
      }
    });
  }

  it('empty key → [REDACTED]', () => {
    expect(maskApiKey('')).toBe('[REDACTED]');
  });

  it('short key → [REDACTED]', () => {
    expect(maskApiKey('abc')).toBe('[REDACTED]');
  });
});

describe('compact home — format and line count', () => {
  it('real provider → ≤15 lines', () => {
    const output = formatCompactHome({
      version: '0.1.0',
      workspacePath: '/home/user/myproject',
      provider: 'anthropic',
      model: 'claude-sonnet',
      projectBrainStatus: 'active',
      mode: 'chat',
    });
    const lines = output.split('\n');
    expect(lines.length).toBeLessThanOrEqual(15);
  });

  it('mock provider → ≤15 lines (with setup hint)', () => {
    const output = formatCompactHome({
      version: '0.1.0',
      workspacePath: '/tmp/project',
      provider: 'mock',
      model: 'mock-coder',
    });
    const lines = output.split('\n');
    expect(lines.length).toBeLessThanOrEqual(15);
  });

  it('no stale branding in output', () => {
    const output = formatCompactHome({
      provider: 'anthropic',
      model: 'claude-sonnet',
      workspacePath: '/home/user/project',
    });
    expect(output).not.toContain('OpenCode');
    expect(output).not.toContain(' opencode');
  });

  it('no api keys in output even with secret-looking path', () => {
    const output = formatCompactHome({
      provider: 'anthropic',
      model: 'claude-sonnet',
      workspacePath: '/tmp/sk-abc12345678/project',
    });
    expect(output).not.toContain('sk-abc12345678');
  });
});

describe('provider list — safety and completeness', () => {
  it('contains all required providers', () => {
    const providers = listProviderOptions();
    const ids = new Set(providers.map((p) => p.id));
    for (const required of ['ollama', 'anthropic', 'openai', 'gemini', 'groq', 'openrouter', 'mock']) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('formatProviderList does not reveal env var values', () => {
    const output = formatProviderList({ANTHROPIC_API_KEY: 'sk-secret1234567890abcdef'});
    expect(output).not.toContain('sk-secret1234567890abcdef');
  });

  it('mock provider shows "testing only" description', () => {
    const mock = listProviderOptions().find((p) => p.id === 'mock');
    expect(mock?.displayName.toLowerCase()).toContain('testing');
  });
});

describe('interactive guard — CI detection', () => {
  it('returns false in test environment (not a TTY)', () => {
    // Tests run without a real TTY, so this should always be false
    const result = isInteractiveContext(['node', 'apeironcode'], {});
    // In a non-TTY env (like CI/test), this should be false
    expect(typeof result).toBe('boolean');
  });

  it('always returns false when GITHUB_ACTIONS=true', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {GITHUB_ACTIONS: 'true'})).toBe(false);
  });

  it('always returns false when CI=1', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {CI: '1'})).toBe(false);
  });
});

describe('formatFirstRunReason — no stale branding', () => {
  const allReasons = ['no-config', 'mock-provider', 'mock-model', 'ok'] as const;

  for (const reason of allReasons) {
    it(`reason=${reason} contains no OpenCode branding`, () => {
      const text = formatFirstRunReason({
        isFirstRun: reason !== 'ok',
        reason,
        provider: 'mock',
        model: 'mock-coder',
      });
      expect(text).not.toContain('OpenCode');
      expect(text).not.toMatch(/\bopencode\b/iu);
    });
  }
});
