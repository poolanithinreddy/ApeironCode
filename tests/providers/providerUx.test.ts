import {afterEach, describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {
  buildProviderSetupGuide,
  formatModelDisplayEntries,
  formatProviderStatuses,
  listModelDisplayEntries,
  listProviderStatuses,
  recommendModels,
} from '../../src/providers/providerUx.js';

describe('providerUx', () => {
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = previousOpenAIKey;
  });

  it('reports provider readiness from config and environment state', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const config = {
      ...DEFAULT_CONFIG,
      defaultModel: 'gpt-4.1-mini',
      defaultProvider: 'openai',
    };

    const statuses = listProviderStatuses(config, providerRegistry);
    const openai = statuses.find((status) => status.name === 'openai');
    const ollama = statuses.find((status) => status.name === 'ollama');

    expect(openai?.configured).toBe(true);
    expect(openai?.current).toBe(true);
    expect(ollama?.local).toBe(true);
    expect(formatProviderStatuses(statuses)).toContain('caps=');
  });

  it('builds setup guidance and model views', () => {
    const config = {
      ...DEFAULT_CONFIG,
      defaultModel: 'qwen2.5-coder:7b',
      defaultProvider: 'ollama',
    };

    expect(buildProviderSetupGuide('ollama', config)).toContain('ollama serve');

    const modelEntries = listModelDisplayEntries(config, providerRegistry, 'coding');
    expect(modelEntries.length).toBeGreaterThan(0);
    expect(formatModelDisplayEntries(modelEntries)).toContain('caps=');

    const recommendations = recommendModels(config, providerRegistry, 'coding');
    expect(recommendations.length).toBeGreaterThan(0);
  });
});