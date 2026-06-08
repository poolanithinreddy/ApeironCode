import {describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {
  chooseFallbackCandidate,
  formatFallbackChain,
  parseProviderModelRef,
  resolveProviderChain,
  validateProviderChain,
} from '../../src/providers/fallbacks.js';
import {PROVIDER_CATALOG} from '../../src/providers/catalog.js';
import {formatProviderFallbackSimulation, simulateProviderFallback} from '../../src/providers/fallbackSimulation.js';

describe('provider fallback chains', () => {
  it('parses provider:model references safely', () => {
    expect(parseProviderModelRef('mock:mock-coder')).toEqual({provider: 'mock', model: 'mock-coder'});
    expect(parseProviderModelRef('mock')).toBeNull();
    expect(parseProviderModelRef(':model')).toBeNull();
  });

  it('marks invalid, missing, and unconfigured entries with skipped reasons', () => {
    const entries = validateProviderChain(
      ['bad-entry', 'missing:model', 'openai:gpt-4.1-mini'],
      PROVIDER_CATALOG,
      DEFAULT_CONFIG,
      {},
    );

    expect(entries[0]?.skippedReason).toContain('invalid fallback entry');
    expect(entries[1]?.skippedReason).toContain('not in the catalog');
    expect(entries[2]?.skippedReason).toContain('OPENAI_API_KEY');
  });

  it('respects localOnly and only selects when auto fallback is enabled', () => {
    const config = {
      ...DEFAULT_CONFIG,
      defaultModel: 'gpt-4.1-mini',
      defaultProvider: 'openai',
      fallbackModel: 'mock:mock-coder',
      localOnly: true,
    };

    const plan = resolveProviderChain('coding', config, {});

    expect(plan.autoFallback).toBe(true);
    expect(plan.selected?.ref.provider).toBe('mock');
    expect(plan.entries.some((entry) => entry.skippedReason?.includes('localOnly'))).toBe(true);
    expect(formatFallbackChain(plan)).toContain('selected: mock:mock-coder');
  });

  it('does not silently choose a fallback when autoFallback is disabled', () => {
    const plan = resolveProviderChain('coding', {...DEFAULT_CONFIG, fallbackModel: undefined}, {});
    expect(plan.autoFallback).toBe(false);
    expect(chooseFallbackCandidate(plan)).toBeUndefined();
  });

  it('simulates classified runtime fallback behavior without provider calls', () => {
    const config = {
      ...DEFAULT_CONFIG,
      defaultModel: 'qwen2.5-coder:7b',
      defaultProvider: 'ollama',
      fallbackModel: 'mock:mock-coder',
    };

    const simulation = simulateProviderFallback(config, 'rate-limit', 'coding');

    expect(simulation.classification.kind).toBe('rate-limit');
    expect(simulation.selected?.ref.model).toBe('mock-coder');
    expect(formatProviderFallbackSimulation(simulation)).toContain('Simulated switch: mock:mock-coder');
  });

  it('shows suggestions only when auto fallback is disabled', () => {
    const simulation = simulateProviderFallback({
      ...DEFAULT_CONFIG,
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
      fallbackModel: undefined,
    }, 'timeout', 'coding');

    expect(simulation.classification.kind).toBe('timeout');
    expect(simulation.selected).toBeUndefined();
    expect(formatProviderFallbackSimulation(simulation)).toContain('would stop');
  });
});
