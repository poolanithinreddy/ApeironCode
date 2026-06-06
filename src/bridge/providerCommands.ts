/**
 * ApeironCode bridge — provider/model catalog commands.
 * Returns safe catalog data with NO env values, API keys, or secrets.
 */

import {PROVIDER_CATALOG, type ProviderCatalogEntry} from '../providers/catalog.js';

/** Safe model entry for bridge clients. */
export interface BridgeModelEntry {
  provider: string;
  providerLabel: string;
  model: string;
  label: string;
  local: boolean;
  contextWindow?: number;
  toolCalling: boolean;
  streaming: boolean;
  roles: string[];
  notes?: string;
}

/** Safe provider entry for bridge clients. Never includes API keys. */
export interface BridgeProviderEntry {
  id: string;
  label: string;
  kind: string;
  local: boolean;
  authType: string;
  /** Human-readable hint for how to configure, never the actual value. */
  authHint?: string;
  configured: boolean;
  status: string;
  models: BridgeModelEntry[];
}

/**
 * Checks if a provider is configured by inspecting env without reading values.
 * Returns true/false — NEVER returns the actual env var value.
 */
const isProviderConfigured = (entry: ProviderCatalogEntry): boolean => {
  if (entry.auth.type === 'none') return true;
  if (entry.auth.type === 'env') {
    return (entry.auth.envVars ?? []).some((v) => Boolean(process.env[v]));
  }
  if (entry.auth.type === 'base-url-env') {
    return (entry.auth.envVars ?? []).some((v) => Boolean(process.env[v]));
  }
  return false;
};

/** Converts a catalog entry to a safe bridge-serializable form. */
export const toBridgeProviderEntry = (entry: ProviderCatalogEntry): BridgeProviderEntry => ({
  id: entry.id,
  label: entry.displayName,
  kind: entry.kind,
  local: entry.capabilities.local,
  authType: entry.auth.type,
  authHint: entry.auth.setupHint,
  configured: isProviderConfigured(entry),
  status: entry.status,
  models: entry.recommendedModels.map((m) => ({
    provider: entry.id,
    providerLabel: entry.displayName,
    model: m.id,
    label: m.label,
    local: entry.capabilities.local,
    contextWindow: m.contextWindow,
    toolCalling: entry.capabilities.nativeToolCalling,
    streaming: entry.capabilities.streaming,
    roles: m.roles,
    notes: m.notes,
  })),
});

/** Returns the full safe catalog. No secrets or env values. */
export const getBridgeProviderCatalog = (): BridgeProviderEntry[] =>
  PROVIDER_CATALOG.filter((e) => e.status !== 'planned').map(toBridgeProviderEntry);

/** Returns a flat list of all bridge model entries. */
export const getBridgeModelList = (): BridgeModelEntry[] =>
  getBridgeProviderCatalog().flatMap((p) => p.models);

/** Validates and returns a provider entry by ID, or null if unknown. */
export const getBridgeProvider = (providerId: unknown): BridgeProviderEntry | null => {
  if (typeof providerId !== 'string') return null;
  const entry = PROVIDER_CATALOG.find((e) => e.id === providerId);
  return entry ? toBridgeProviderEntry(entry) : null;
};

/** Validates provider/model pair for bridge session override. No secrets, no env values. */
export const validateBridgeSessionModel = (
  providerId: unknown,
  modelId: unknown,
): {ok: true; providerId: string; modelId: string} | {ok: false; code: string; message: string} => {
  if (typeof providerId !== 'string' || !providerId.trim()) {
    return {ok: false, code: 'INVALID_PROVIDER', message: 'providerId must be a non-empty string'};
  }
  if (typeof modelId !== 'string' || !modelId.trim()) {
    return {ok: false, code: 'INVALID_MODEL', message: 'modelId must be a non-empty string'};
  }
  const entry = getBridgeProvider(providerId);
  if (!entry) {
    return {ok: false, code: 'UNKNOWN_PROVIDER', message: 'Unknown provider'};
  }
  const known = entry.models.some((m) => m.model === modelId);
  if (!known) {
    return {ok: false, code: 'UNKNOWN_MODEL', message: 'Model not listed for this provider'};
  }
  return {ok: true, providerId: providerId.trim(), modelId: modelId.trim()};
};
