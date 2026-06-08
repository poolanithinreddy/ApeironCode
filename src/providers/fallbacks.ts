import type {ApeironCodeConfig} from '../config/config.js';
import {
  getProviderCatalogEntry,
  getProvidersForRole,
  listProviderCatalogEntries,
  type ProviderCatalogEntry,
  type ProviderStatus,
} from './catalog.js';
import type {ModelRole} from './modelCatalog.js';
import type {ProviderRegistry} from './registry.js';

export interface ProviderModelRef {
  provider: string;
  model: string;
}

export type ProviderFallbackRole = 'cheap' | 'coding' | 'fast' | 'local' | 'reasoning';

export interface ProviderFallbackEntry {
  available: boolean;
  configured: boolean;
  providerStatus?: ProviderStatus;
  ref: ProviderModelRef;
  skippedReason?: string;
}

export interface ProviderFallbackPlan {
  autoFallback: boolean;
  entries: ProviderFallbackEntry[];
  role: ProviderFallbackRole;
  selected?: ProviderFallbackEntry;
}

export interface FallbackChain {
  primary: string;
  fallbacks: string[];
  reason: string;
}

const FALLBACK_ROLES: ProviderFallbackRole[] = ['coding', 'reasoning', 'fast', 'local', 'cheap'];

const isFallbackRole = (value: string): value is ProviderFallbackRole => {
  return (FALLBACK_ROLES as string[]).includes(value);
};

export const parseProviderModelRef = (value: string): ProviderModelRef | null => {
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }

  const provider = trimmed.slice(0, separatorIndex).trim();
  const model = trimmed.slice(separatorIndex + 1).trim();
  if (!provider || !model) {
    return null;
  }

  return {model, provider};
};

export const shouldAutoFallback = (config: ApeironCodeConfig): boolean => {
  return Boolean(config.fallbackModel);
};

const uniqueRefs = (refs: ProviderModelRef[]): ProviderModelRef[] => {
  const seen = new Set<string>();
  const unique: ProviderModelRef[] = [];
  for (const ref of refs) {
    const key = `${ref.provider}:${ref.model}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(ref);
  }
  return unique;
};

const refsForRole = (role: ProviderFallbackRole): ProviderModelRef[] => {
  return getProvidersForRole(role).flatMap((provider) =>
    provider.recommendedModels
      .filter((model) => model.roles.includes(role))
      .map((model) => ({model: model.id, provider: provider.id})),
  );
};

const refFromModelReference = (
  modelReference: string | undefined,
  defaultProvider: string,
): ProviderModelRef | null => {
  if (!modelReference) {
    return null;
  }

  return parseProviderModelRef(modelReference) ?? {model: modelReference, provider: defaultProvider};
};

const isProviderConfigured = (
  provider: ProviderCatalogEntry,
  config: ApeironCodeConfig,
  env: Record<string, string | undefined>,
): {configured: boolean; reason?: string} => {
  if (provider.auth.type === 'none') {
    return {configured: true};
  }

  if (provider.auth.type === 'base-url-env') {
    return {configured: Boolean(config.baseUrls[provider.id] ?? provider.auth.setupHint)};
  }

  const missing = (provider.auth.envVars ?? []).filter((envName) => !env[envName]);
  if (missing.length > 0) {
    return {
      configured: false,
      reason: `missing env var ${missing.join(', ')}`,
    };
  }

  if (provider.auth.type === 'manual' && provider.id === 'openaiCompatible' && !config.baseUrls.openaiCompatible) {
    return {
      configured: false,
      reason: 'missing OpenAI-compatible base URL',
    };
  }

  return {configured: true};
};

export const validateProviderChain = (
  chain: Array<ProviderModelRef | string>,
  catalog: ProviderCatalogEntry[] = listProviderCatalogEntries(),
  config: ApeironCodeConfig,
  env: Record<string, string | undefined> = process.env,
): ProviderFallbackEntry[] => {
  return chain.map((candidate) => {
    const ref = typeof candidate === 'string' ? parseProviderModelRef(candidate) : candidate;
    if (!ref) {
      return {
        available: false,
        configured: false,
        ref: {model: '(invalid)', provider: '(invalid)'},
        skippedReason: `invalid fallback entry ${typeof candidate === 'string' ? candidate : ''}`.trim(),
      };
    }

    const provider = catalog.find((entry) => entry.id === ref.provider);
    if (!provider) {
      return {
        available: false,
        configured: false,
        ref,
        skippedReason: `provider ${ref.provider} is not in the catalog`,
      };
    }

    if (config.localOnly && !provider.capabilities.local) {
      return {
        available: false,
        configured: false,
        providerStatus: provider.status,
        ref,
        skippedReason: 'localOnly is enabled and this provider is cloud-hosted',
      };
    }

    const knownModel = provider.recommendedModels.some((model) => model.id === ref.model);
    const configuration = isProviderConfigured(provider, config, env);
    const skippedReason = configuration.reason
      ?? (knownModel || provider.id === 'openaiCompatible' ? undefined : `model ${ref.model} is not recommended in catalog`);

    return {
      available: configuration.configured && !skippedReason,
      configured: configuration.configured,
      providerStatus: provider.status,
      ref,
      skippedReason,
    };
  });
};

const rankEntries = (entries: ProviderFallbackEntry[]): ProviderFallbackEntry[] => {
  const statusScore = (status?: ProviderStatus): number => {
    if (status === 'stable') return 2;
    if (status === 'experimental') return 1;
    return 0;
  };

  return [...entries].sort((left, right) =>
    Number(right.available) - Number(left.available)
    || statusScore(right.providerStatus) - statusScore(left.providerStatus),
  );
};

export const chooseFallbackCandidate = (plan: ProviderFallbackPlan): ProviderFallbackEntry | undefined => {
  if (!plan.autoFallback) {
    return undefined;
  }

  return plan.entries.find((entry) => entry.configured && entry.available);
};

export const resolveProviderChain = (
  role: string,
  config: ApeironCodeConfig,
  env: Record<string, string | undefined> = process.env,
): ProviderFallbackPlan => {
  const normalizedRole = isFallbackRole(role) ? role : 'coding';
  const roleModel = refFromModelReference(config.models[normalizedRole], config.defaultProvider);
  const primary = {model: config.defaultModel, provider: config.defaultProvider};
  const configuredFallback = refFromModelReference(config.fallbackModel, config.defaultProvider);
  const chain = uniqueRefs([
    ...(roleModel ? [roleModel] : []),
    primary,
    ...(configuredFallback ? [configuredFallback] : []),
    ...refsForRole(normalizedRole),
  ]);
  const entries = rankEntries(validateProviderChain(chain, listProviderCatalogEntries(), config, env));
  const plan: ProviderFallbackPlan = {
    autoFallback: shouldAutoFallback(config),
    entries,
    role: normalizedRole,
  };
  const selected = chooseFallbackCandidate(plan);
  return selected ? {...plan, selected} : plan;
};

export const formatFallbackChain = (plan: ProviderFallbackPlan | FallbackChain): string => {
  if ('primary' in plan) {
    const lines = [`Primary: ${plan.primary}`, plan.reason];
    if (plan.fallbacks.length > 0) {
      lines.push('', 'Fallbacks:', ...plan.fallbacks.map((provider, index) => `  ${index + 1}. ${provider}`));
    } else {
      lines.push('No fallbacks (provider is configured)');
    }
    return lines.join('\n');
  }

  const lines: string[] = [
    `Fallback role: ${plan.role}`,
    `autoFallback: ${plan.autoFallback ? 'true' : 'false'}`,
    plan.selected ? `selected: ${plan.selected.ref.provider}:${plan.selected.ref.model}` : 'selected: none',
    '',
    'Chain:',
  ];

  for (const [index, entry] of plan.entries.entries()) {
    lines.push([
      `${index + 1}. ${entry.ref.provider}:${entry.ref.model}`,
      entry.configured ? 'configured' : 'missing',
      entry.available ? 'available' : 'unavailable',
      entry.providerStatus ? `status=${entry.providerStatus}` : null,
      entry.skippedReason ? `skip=${entry.skippedReason}` : null,
    ].filter(Boolean).join(' | '));
  }

  return lines.join('\n');
};

export const buildFallbackChain = (
  primaryProvider: string,
  config: ApeironCodeConfig,
  _registry: ProviderRegistry,
  role?: ModelRole,
): FallbackChain => {
  const catalogEntry = getProviderCatalogEntry(primaryProvider);
  const configured = catalogEntry ? isProviderConfigured(catalogEntry, config, process.env).configured : false;
  if (configured) {
    return {
      fallbacks: [],
      primary: primaryProvider,
      reason: 'Primary provider is configured and ready',
    };
  }

  const plan = resolveProviderChain(role ?? 'coding', config);
  return {
    fallbacks: plan.entries
      .filter((entry) => entry.ref.provider !== primaryProvider && entry.available)
      .map((entry) => entry.ref.provider)
      .slice(0, 3),
    primary: primaryProvider,
    reason: `Primary provider ${primaryProvider} is not configured`,
  };
};

export const resolveLegacyFallbackChain = (
  primaryProvider: string,
  config: ApeironCodeConfig,
  registry: ProviderRegistry,
  role?: ModelRole,
): {selected: string; reason: string} => {
  const chain = buildFallbackChain(primaryProvider, config, registry, role);
  const fallbackProvider = chain.fallbacks[0];
  if (!fallbackProvider) {
    return {
      reason: chain.fallbacks.length === 0 ? 'Using configured primary provider' : 'No fallback alternatives available',
      selected: chain.primary,
    };
  }

  return {
    reason: `Primary provider ${primaryProvider} unavailable; using fallback: ${fallbackProvider}`,
    selected: fallbackProvider,
  };
};

export const suggestBestProvider = (
  config: ApeironCodeConfig,
  _registry: ProviderRegistry,
  role: ModelRole = 'coding',
): {provider: string; reason: string} => {
  const plan = resolveProviderChain(role, config);
  const selected = plan.entries.find((entry) => entry.available);
  if (selected) {
    return {
      provider: selected.ref.provider,
      reason: `${selected.ref.provider}:${selected.ref.model} is available for ${role}`,
    };
  }

  return {
    provider: 'mock',
    reason: `No providers configured for ${role}; using mock provider for testing`,
  };
};
