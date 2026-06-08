import {describe, expect, it} from 'vitest';

import {detectFirstRunState, formatFirstRunReason, shouldShowFirstRunSetup} from '../../src/cli/setup/firstRun.js';

describe('detectFirstRunState', () => {
  it('returns isFirstRun=false for a configured real provider', () => {
    const state = detectFirstRunState({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet',
      hasUserConfigFile: true,
    });
    expect(state.isFirstRun).toBe(false);
    expect(state.reason).toBe('ok');
    expect(state.provider).toBe('anthropic');
    expect(state.model).toBe('claude-sonnet');
  });

  it('returns isFirstRun=true when provider is mock', () => {
    const state = detectFirstRunState({
      defaultProvider: 'mock',
      defaultModel: 'some-model',
      hasUserConfigFile: true,
    });
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('mock-provider');
  });

  it('returns isFirstRun=true when model is mock-coder', () => {
    const state = detectFirstRunState({
      defaultProvider: 'ollama',
      defaultModel: 'mock-coder',
      hasUserConfigFile: true,
    });
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('mock-model');
  });

  it('returns isFirstRun=true when config is missing', () => {
    const state = detectFirstRunState({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet',
      hasUserConfigFile: false,
    });
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('no-config');
  });

  it('prefers no-config reason over mock-provider when both apply', () => {
    const state = detectFirstRunState({
      defaultProvider: 'mock',
      defaultModel: 'mock-coder',
      hasUserConfigFile: false,
    });
    expect(state.isFirstRun).toBe(true);
    expect(state.reason).toBe('no-config');
  });

  it('handles missing provider and model gracefully', () => {
    const state = detectFirstRunState({});
    expect(state.isFirstRun).toBe(true);
  });
});

describe('shouldShowFirstRunSetup', () => {
  const firstRunState = {
    isFirstRun: true,
    reason: 'mock-provider',
    provider: 'mock',
    model: 'mock-coder',
  };

  it('returns false when not a first run', () => {
    const notFirstRun = {isFirstRun: false, reason: 'ok', provider: 'anthropic', model: 'claude'};
    expect(shouldShowFirstRunSetup(notFirstRun)).toBe(false);
  });

  it('returns false when --no-setup is set', () => {
    expect(shouldShowFirstRunSetup(firstRunState, {noSetup: true})).toBe(false);
  });

  it('returns false in CI environment (CI=1)', () => {
    const originalCI = process.env.CI;
    process.env.CI = '1';
    try {
      expect(shouldShowFirstRunSetup(firstRunState)).toBe(false);
    } finally {
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
    }
  });

  it('returns false in CI environment (CI=true)', () => {
    const originalCI = process.env.CI;
    process.env.CI = 'true';
    try {
      expect(shouldShowFirstRunSetup(firstRunState)).toBe(false);
    } finally {
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
    }
  });

  it('returns false for doctor subcommand', () => {
    expect(shouldShowFirstRunSetup(firstRunState, {argv: ['node', 'apeironcode', 'doctor']})).toBe(false);
  });

  it('returns false for help subcommand', () => {
    expect(shouldShowFirstRunSetup(firstRunState, {argv: ['node', 'apeironcode', '--help']})).toBe(false);
  });

  it('returns false for bridge subcommand', () => {
    expect(shouldShowFirstRunSetup(firstRunState, {argv: ['node', 'apeironcode', 'bridge']})).toBe(false);
  });

  it('returns true for plain run with first-run state and no CI', () => {
    const result = shouldShowFirstRunSetup(firstRunState, {
      argv: ['node', 'apeironcode'],
      env: {},
    });
    expect(result).toBe(true);
  });
});

describe('formatFirstRunReason', () => {
  it('formats no-config reason', () => {
    const result = formatFirstRunReason({isFirstRun: true, reason: 'no-config', provider: '', model: ''});
    expect(result).toContain('No configuration file');
    expect(result).toContain('apeironcode setup');
  });

  it('formats mock-provider reason', () => {
    const result = formatFirstRunReason({isFirstRun: true, reason: 'mock-provider', provider: 'mock', model: 'mock-coder'});
    expect(result).toContain('Mock (testing only)');
    expect(result).toContain('apeironcode setup');
  });

  it('formats mock-model reason', () => {
    const result = formatFirstRunReason({isFirstRun: true, reason: 'mock-model', provider: 'ollama', model: 'mock-coder'});
    expect(result).toContain('Mock (testing only)');
    expect(result).toContain('apeironcode setup');
  });

  it('formats ok reason (no first run)', () => {
    const result = formatFirstRunReason({isFirstRun: false, reason: 'ok', provider: 'anthropic', model: 'claude'});
    expect(result).toContain('configured');
  });

  it('does not leak provider names or secrets in reason text', () => {
    const result = formatFirstRunReason({isFirstRun: true, reason: 'mock-provider', provider: 'mock', model: ''});
    expect(result).not.toMatch(/sk-[A-Za-z0-9]/u);
    expect(result).not.toContain('opencode');
  });
});
