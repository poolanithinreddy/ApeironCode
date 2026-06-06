/**
 * Tests for bridge provider commands.
 */

import {describe, it, expect} from 'vitest';
import {
  getBridgeProviderCatalog,
  getBridgeModelList,
  getBridgeProvider,
  toBridgeProviderEntry,
  validateBridgeSessionModel,
} from '../../src/bridge/providerCommands.js';
import {PROVIDER_CATALOG} from '../../src/providers/catalog.js';

describe('getBridgeProviderCatalog', () => {
  it('returns a non-empty catalog', () => {
    const catalog = getBridgeProviderCatalog();
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('excludes planned providers', () => {
    const catalog = getBridgeProviderCatalog();
    for (const p of catalog) {
      expect(p.status).not.toBe('planned');
    }
  });

  it('has required fields on each entry', () => {
    const catalog = getBridgeProviderCatalog();
    for (const p of catalog) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.kind).toBe('string');
      expect(typeof p.configured).toBe('boolean');
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  it('never leaks env var values', () => {
    const catalog = getBridgeProviderCatalog();
    const json = JSON.stringify(catalog);
    // Should not contain actual environment variable patterns
    expect(json).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(json).not.toMatch(/"apiKey"\s*:/);
    expect(json).not.toMatch(/"secret"\s*:/i);
  });

  it('each model entry has provider, model, label', () => {
    const catalog = getBridgeProviderCatalog();
    for (const p of catalog) {
      for (const m of p.models) {
        expect(typeof m.provider).toBe('string');
        expect(typeof m.model).toBe('string');
        expect(typeof m.label).toBe('string');
        expect(typeof m.toolCalling).toBe('boolean');
        expect(typeof m.streaming).toBe('boolean');
        expect(typeof m.local).toBe('boolean');
      }
    }
  });
});

describe('getBridgeModelList', () => {
  it('returns flat model list', () => {
    const models = getBridgeModelList();
    expect(models.length).toBeGreaterThan(0);
  });

  it('all models have provider and model id', () => {
    for (const m of getBridgeModelList()) {
      expect(m.provider.length).toBeGreaterThan(0);
      expect(m.model.length).toBeGreaterThan(0);
    }
  });
});

describe('getBridgeProvider', () => {
  it('returns null for unknown provider', () => {
    expect(getBridgeProvider('nonexistent-provider')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(getBridgeProvider(42)).toBeNull();
    expect(getBridgeProvider(null)).toBeNull();
    expect(getBridgeProvider(undefined)).toBeNull();
  });

  it('returns entry for known provider', () => {
    // Find a non-planned provider
    const knownId = PROVIDER_CATALOG.find((e) => e.status !== 'planned')?.id;
    if (!knownId) return;
    const entry = getBridgeProvider(knownId);
    expect(entry).not.toBeNull();
    expect(entry?.id).toBe(knownId);
  });
});

describe('validateBridgeSessionModel', () => {
  it('rejects unknown provider', () => {
    const r = validateBridgeSessionModel('not-a-real-provider-id-xyz', 'm');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNKNOWN_PROVIDER');
  });

  it('rejects unknown model for known provider', () => {
    const knownId = PROVIDER_CATALOG.find((e) => e.status !== 'planned')?.id;
    if (!knownId) return;
    const r = validateBridgeSessionModel(knownId, 'model-that-does-not-exist-99999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNKNOWN_MODEL');
  });

  it('accepts valid provider/model from catalog', () => {
    const entry = PROVIDER_CATALOG.find((e) => e.status !== 'planned' && e.recommendedModels.length > 0);
    if (!entry) return;
    const modelId = entry.recommendedModels[0]!.id;
    const r = validateBridgeSessionModel(entry.id, modelId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerId).toBe(entry.id);
      expect(r.modelId).toBe(modelId);
    }
  });

  it('never includes secrets in validation messages', () => {
    const r = validateBridgeSessionModel('', 'sk-secret-key-value-12345');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain('sk-secret');
  });
});

describe('toBridgeProviderEntry safety', () => {
  it('never includes envVars values', () => {
    for (const catalogEntry of PROVIDER_CATALOG) {
      if (catalogEntry.status === 'planned') continue;
      const entry = toBridgeProviderEntry(catalogEntry);
      const json = JSON.stringify(entry);
      // authHint may reference env var names but not values
      for (const envVar of catalogEntry.auth.envVars ?? []) {
        const actualValue = process.env[envVar];
        if (actualValue) {
          expect(json).not.toContain(actualValue);
        }
      }
    }
  });

  it('local providers are marked correctly', () => {
    const localEntry = PROVIDER_CATALOG.find((e) => e.capabilities.local && e.status !== 'planned');
    if (!localEntry) return;
    const bridge = toBridgeProviderEntry(localEntry);
    expect(bridge.local).toBe(true);
  });
});
