import {describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ProviderRegistry} from '../../src/providers/registry.js';

describe('ProviderRegistry', () => {
  it('creates registered providers', () => {
    const registry = new ProviderRegistry();
    const provider = registry.create('ollama', DEFAULT_CONFIG);

    expect(provider.name).toBe('ollama');
  });

  it('throws on unknown providers', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.create('unknown', DEFAULT_CONFIG)).toThrow(/Unknown provider/);
  });
});