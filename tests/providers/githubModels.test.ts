import {describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {getProviderCatalogEntry} from '../../src/providers/catalog.js';
import {ProviderRegistry} from '../../src/providers/registry.js';
import {redactSecret} from '../../src/config/secrets.js';
import {maskApiKey} from '../../src/cli/setup/providerWizard.js';

describe('GitHub Models provider', () => {
  it('is registered and creates an openai-compatible client', () => {
    const registry = new ProviderRegistry();
    expect(registry.has('github-models')).toBe(true);
    const provider = registry.create('github-models', DEFAULT_CONFIG);
    expect(provider.name).toBe('github-models');
  });

  it('exposes a first-class catalog entry with GitHub Models branding', () => {
    const entry = getProviderCatalogEntry('github-models');
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe('GitHub Models');
    expect(entry?.auth.envVars).toContain('GITHUB_TOKEN');
    expect(entry?.recommendedModels.map((m) => m.id)).toContain('openai/gpt-4.1');
  });

  it('resolves the GitHub Models base URL and env var from defaults', () => {
    expect(DEFAULT_CONFIG.baseUrls['github-models']).toBe('https://models.github.ai/inference');
    expect(DEFAULT_CONFIG.apiKeyEnvNames['github-models']).toBe('GITHUB_TOKEN');
  });

  it('never prints a full token', () => {
    const token = 'github_pat_11ABCDEFG0superSecretTokenValue9876';
    expect(redactSecret(token)).not.toContain('superSecret');
    expect(maskApiKey(token)).not.toContain('superSecret');
    expect(maskApiKey(token)).toMatch(/\.\.\./u);
  });
});
