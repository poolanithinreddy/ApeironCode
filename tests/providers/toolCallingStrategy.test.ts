import {describe, expect, it} from 'vitest';

import {PROVIDER_CATALOG} from '../../src/providers/catalog.js';
import {getToolCallingStrategy} from '../../src/providers/toolCallingStrategy.js';
import {buildProviderPromptHints} from '../../src/providers/promptHints.js';
import {getProviderCapabilities} from '../../src/providers/modelCatalog.js';

describe('tool calling strategy', () => {
  it('chooses native tool calling for native providers', () => {
    expect(getToolCallingStrategy('openai', 'gpt-4.1-mini', PROVIDER_CATALOG)).toBe('native-tool-calling');
  });

  it('chooses tag or JSON strategy for local providers', () => {
    expect(getToolCallingStrategy('ollama', 'qwen2.5-coder:7b', PROVIDER_CATALOG)).toBe('apeironcode-tool-call-tag');
    expect(getToolCallingStrategy('mock', 'mock-coder', PROVIDER_CATALOG)).toBe('json-block');
  });

  it('falls back safely for unknown providers', () => {
    expect(getToolCallingStrategy('unknown', 'unknown', PROVIDER_CATALOG)).toBe('plain-text-no-tools');
  });

  it('adds plain-text guidance for unknown provider prompt hints', () => {
    const hints = buildProviderPromptHints({
      capabilities: getProviderCapabilities('unknown', 'unknown'),
      model: 'unknown',
      providerName: 'unknown',
    });
    expect(hints).toContain('plain text');
  });
});
