import {describe, expect, it} from 'vitest';

import {
  detectConfiguredProviders,
  formatProviderChoice,
  formatProviderList,
  formatWizardOutput,
  listProviderOptions,
  maskApiKey,
} from '../../src/cli/setup/providerWizard.js';

describe('listProviderOptions', () => {
  it('returns all expected providers', () => {
    const providers = listProviderOptions();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('ollama');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
    expect(ids).toContain('gemini');
    expect(ids).toContain('groq');
    expect(ids).toContain('openrouter');
    expect(ids).toContain('github-models');
    expect(ids).toContain('mock');
  });

  it('marks ollama as local and free', () => {
    const ollama = listProviderOptions().find((p) => p.id === 'ollama');
    expect(ollama?.isLocal).toBe(true);
    expect(ollama?.isFree).toBe(true);
  });

  it('marks anthropic as not local, not free', () => {
    const anthropic = listProviderOptions().find((p) => p.id === 'anthropic');
    expect(anthropic?.isLocal).toBe(false);
    expect(anthropic?.isFree).toBe(false);
  });

  it('all providers have required fields', () => {
    for (const p of listProviderOptions()) {
      expect(p.id).toBeTruthy();
      expect(p.displayName).toBeTruthy();
      expect(p.bestUse).toBeTruthy();
      expect(p.setupHint).toBeTruthy();
    }
  });

  it('mock provider displayName contains "testing only"', () => {
    const mock = listProviderOptions().find((p) => p.id === 'mock');
    expect(mock?.displayName).toContain('testing only');
  });
});

describe('maskApiKey', () => {
  it('never returns the full key', () => {
    const fullKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH';
    const masked = maskApiKey(fullKey);
    expect(masked).not.toBe(fullKey);
    expect(masked.length).toBeLessThan(fullKey.length);
  });

  it('returns sk- prefix with last 4 chars', () => {
    const key = 'sk-abcdef1234LAST';
    const masked = maskApiKey(key);
    expect(masked).toMatch(/^sk-\.\.\..{4}$/u);
    expect(masked).toContain('LAST');
  });

  it('redacts short keys', () => {
    expect(maskApiKey('')).toBe('[REDACTED]');
    expect(maskApiKey('abc')).toBe('[REDACTED]');
  });

  it('handles non-sk- prefixed keys', () => {
    const key = 'ghp_abcdefghijklmnopqrst';
    const masked = maskApiKey(key);
    expect(masked).not.toBe(key);
    expect(masked).toContain('...');
  });

  it('always hides the middle portion of a long key', () => {
    const longKey = 'sk-' + 'x'.repeat(50) + 'LAST';
    const masked = maskApiKey(longKey);
    expect(masked).not.toContain('x'.repeat(10));
    expect(masked).toContain('LAST');
  });
});

describe('detectConfiguredProviders', () => {
  it('marks local providers as always configured', () => {
    const result = detectConfiguredProviders({});
    expect(result.get('ollama')).toBe(true);
    expect(result.get('mock')).toBe(true);
  });

  it('marks API providers as configured when env var is set', () => {
    const result = detectConfiguredProviders({
      ANTHROPIC_API_KEY: 'sk-test-key-here',
      OPENAI_API_KEY: '',
    });
    expect(result.get('anthropic')).toBe(true);
    expect(result.get('openai')).toBe(false);
  });

  it('marks API providers as not configured when env var is missing', () => {
    const result = detectConfiguredProviders({});
    expect(result.get('anthropic')).toBe(false);
    expect(result.get('openai')).toBe(false);
    expect(result.get('gemini')).toBe(false);
  });

  it('returns entries for all known providers', () => {
    const result = detectConfiguredProviders({});
    const ids = listProviderOptions().map((p) => p.id);
    for (const id of ids) {
      expect(result.has(id)).toBe(true);
    }
  });
});

describe('formatProviderChoice', () => {
  const anthropic = listProviderOptions().find((p) => p.id === 'anthropic')!;
  const ollama = listProviderOptions().find((p) => p.id === 'ollama')!;

  it('shows [ready] for local providers', () => {
    const status = formatProviderChoice(ollama, {});
    expect(status.display).toContain('[ready]');
    expect(status.configured).toBe(true);
  });

  it('shows [configured] when env var is set', () => {
    const status = formatProviderChoice(anthropic, {ANTHROPIC_API_KEY: 'sk-test-key-here'});
    expect(status.display).toContain('[configured]');
    expect(status.configured).toBe(true);
  });

  it('shows [key missing] when env var is absent', () => {
    const status = formatProviderChoice(anthropic, {});
    expect(status.display).toContain('[key missing]');
    expect(status.configured).toBe(false);
  });

  it('does not reveal the actual key in display text', () => {
    const status = formatProviderChoice(anthropic, {ANTHROPIC_API_KEY: 'sk-real-secret-key'});
    expect(status.display).not.toContain('sk-real-secret-key');
  });
});

describe('formatWizardOutput', () => {
  it('includes provider and model in output', () => {
    const output = formatWizardOutput({provider: 'anthropic', model: 'claude-sonnet'});
    expect(output).toContain('anthropic');
    expect(output).toContain('claude-sonnet');
  });

  it('includes masked API key when provided', () => {
    const masked = maskApiKey('sk-abc123456789LAST');
    const output = formatWizardOutput({provider: 'anthropic', apiKeyMasked: masked});
    expect(output).toContain(masked);
    expect(output).not.toContain('abc123456789');
  });

  it('shows next steps after setup', () => {
    const output = formatWizardOutput({provider: 'ollama'});
    expect(output).toContain('apeironcode');
  });

  it('does not include API key when not provided', () => {
    const output = formatWizardOutput({provider: 'ollama'});
    expect(output).not.toContain('API Key');
  });
});

describe('formatProviderList', () => {
  it('lists all providers', () => {
    const output = formatProviderList({});
    const ids = ['ollama', 'anthropic', 'openai', 'gemini', 'groq'];
    for (const id of ids) {
      expect(output.toLowerCase()).toContain(id);
    }
  });

  it('shows setup hints for unconfigured API providers', () => {
    const output = formatProviderList({});
    expect(output).toContain('Export ANTHROPIC_API_KEY');
  });

  it('does not reveal actual API keys', () => {
    const output = formatProviderList({ANTHROPIC_API_KEY: 'sk-secret-key-1234'});
    expect(output).not.toContain('sk-secret-key-1234');
  });
});
