import {describe, expect, it} from 'vitest';

import {
  getProviderToolCapabilities,
  supportsNativeToolCalling,
} from '../../src/providers/toolCompatibility.js';

describe('toolCompatibility', () => {
  it('anthropic capabilities are correct', () => {
    const caps = getProviderToolCapabilities('anthropic');
    expect(caps.nativeToolCalling).toBe(true);
    expect(caps.parallelToolCalls).toBe(true);
    expect(caps.strategy).toBe('native');
    expect(caps.jsonSchemaSupport).toBe('full');
  });

  it('openai capabilities are correct', () => {
    const caps = getProviderToolCapabilities('openai');
    expect(caps.nativeToolCalling).toBe(true);
    expect(caps.maxTools).toBe(128);
    expect(caps.strategy).toBe('native');
  });

  it('gemini strategy is native_serialized', () => {
    expect(getProviderToolCapabilities('gemini').strategy).toBe('native_serialized');
  });

  it('ollama strategy is disabled', () => {
    const caps = getProviderToolCapabilities('ollama');
    expect(caps.strategy).toBe('disabled');
    expect(caps.nativeToolCalling).toBe(false);
  });

  it('unknown provider falls back to disabled', () => {
    const caps = getProviderToolCapabilities('totally-unknown-xyz');
    expect(caps.strategy).toBe('disabled');
    expect(supportsNativeToolCalling('totally-unknown-xyz')).toBe(false);
  });
});
