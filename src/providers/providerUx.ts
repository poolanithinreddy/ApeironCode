import type {ApeironCodeConfig} from '../config/config.js';
import {resolveProviderApiKey} from '../config/secrets.js';
import type {ProviderRegistry} from './registry.js';
import {
  formatProviderCapabilities,
  getProviderCapabilities,
  getModelPriceTier,
  listCatalogEntries,
  type ModelCatalogEntry,
  type ModelRole,
} from './modelCatalog.js';
import {getProviderCatalogEntry, listProviderCatalogEntries, type ProviderCatalogEntry, type RecommendedModel} from './catalog.js';
import {validateProviderEnv} from './envValidation.js';

export interface ProviderStatus {
  apiKeyConfigured: boolean;
  apiKeyEnvName?: string;
  baseUrl?: string;
  configured: boolean;
  current: boolean;
  fallback: boolean;
  local: boolean;
  name: string;
  recommendedModel?: string;
}

const providerDisplayName = (providerName: string): string => {
  return providerName === 'openaiCompatible'
    ? 'OpenAI Compatible'
    : providerName.charAt(0).toUpperCase() + providerName.slice(1);
};

const isLocalProvider = (providerName: string): boolean => ['mock', 'ollama'].includes(providerName);

export const listProviderStatuses = (
  config: ApeironCodeConfig,
  registry: ProviderRegistry,
): ProviderStatus[] => {
  return registry
    .listProviderNames()
    .map((providerName) => {
      const local = isLocalProvider(providerName);
      const apiKeyEnvName = config.apiKeyEnvNames[providerName];
      const apiKeyConfigured = Boolean(resolveProviderApiKey(providerName, config));
      const baseUrl = config.baseUrls[providerName] ?? config.baseUrls.openaiCompatible;
      const recommendedModel = listCatalogEntries().find((entry) => entry.providerName === providerName)?.model;
      return {
        apiKeyConfigured,
        apiKeyEnvName,
        baseUrl,
        configured: local ? Boolean(baseUrl || providerName === 'mock') : apiKeyConfigured,
        current: config.defaultProvider === providerName,
        fallback: config.fallbackModel
          ? listCatalogEntries().some((entry) => entry.providerName === providerName && entry.model === config.fallbackModel)
          : false,
        local,
        name: providerName,
        recommendedModel,
      };
    })
    .sort((left, right) => Number(right.current) - Number(left.current) || Number(right.configured) - Number(left.configured) || left.name.localeCompare(right.name));
};

export const formatProviderStatuses = (statuses: ProviderStatus[]): string => {
  return statuses
    .map((status) => [
      `${status.current ? '*' : ' '} ${providerDisplayName(status.name)} (${status.name})`,
      status.local ? 'local' : 'cloud',
      status.configured ? 'configured' : 'needs-setup',
      `caps=${formatProviderCapabilities(getProviderCapabilities(status.name, status.recommendedModel ?? ''))}`,
      status.fallback ? 'fallback' : null,
      status.apiKeyEnvName ? `${status.apiKeyEnvName}=${status.apiKeyConfigured ? 'set' : 'missing'}` : null,
      status.baseUrl ? `baseUrl=${status.baseUrl}` : null,
      status.recommendedModel ? `recommended=${status.recommendedModel}` : null,
    ].filter(Boolean).join(' | '))
    .join('\n');
};

export const buildProviderSetupGuide = (
  providerName: string,
  config: ApeironCodeConfig,
): string => {
  const apiKeyEnvName = config.apiKeyEnvNames[providerName] ?? 'API_KEY';
  const baseUrl = config.baseUrls[providerName] ?? config.baseUrls.openaiCompatible ?? '';

  switch (providerName) {
    case 'ollama':
      return [
        '1. Install Ollama and start the local daemon with `ollama serve`.',
        `2. Pull a coding model such as \`ollama pull ${config.defaultModel || 'qwen2.5-coder:7b'}\`.`,
        `3. Confirm the base URL if needed: ${baseUrl || 'http://localhost:11434'}.`,
        '4. Set Ollama as default with `apeironcode config set provider ollama` and choose a local model with `apeironcode config set model ...`.',
      ].join('\n');
    case 'mock':
      return [
        '1. Use the mock provider for deterministic local tests and workflow fixtures.',
        '2. Set it as default with `apeironcode config set provider mock`.',
        '3. Pair it with `mock-coder` when you want repeatable CI or local test runs.',
      ].join('\n');
    default:
      return [
        `1. Export ${apiKeyEnvName} in your shell before starting ApeironCode.`,
        baseUrl ? `2. Verify the base URL is correct: ${baseUrl}.` : '2. Configure a base URL if your provider requires one.',
        `3. Set the provider with \`apeironcode config set provider ${providerName}\`.`,
        '4. Pick a matching model with `apeironcode config set model ...` or use `apeironcode model recommend`.',
      ].join('\n');
  }
};

export interface ModelDisplayEntry {
  configuredProvider: boolean;
  current: boolean;
  displayName: string;
  local: boolean;
  model: string;
  notes?: string;
  priceTier: ReturnType<typeof getModelPriceTier>;
  providerName: string;
  roles: ModelRole[];
}

export const listModelDisplayEntries = (
  config: ApeironCodeConfig,
  registry: ProviderRegistry,
  role?: ModelRole,
): ModelDisplayEntry[] => {
  const statuses = new Map(listProviderStatuses(config, registry).map((status) => [status.name, status]));
  return listCatalogEntries(role)
    .map((entry) => ({
      configuredProvider: statuses.get(entry.providerName)?.configured ?? false,
      current: config.defaultProvider === entry.providerName && config.defaultModel === entry.model,
      displayName: entry.displayName,
      local: entry.capabilities.local,
      model: entry.model,
      notes: entry.notes,
      priceTier: getModelPriceTier(entry),
      providerName: entry.providerName,
      roles: entry.roles,
    }))
    .sort((left, right) => Number(right.current) - Number(left.current)
      || Number(right.configuredProvider) - Number(left.configuredProvider)
      || Number(right.local) - Number(left.local)
      || left.displayName.localeCompare(right.displayName));
};

export const formatModelDisplayEntries = (entries: ModelDisplayEntry[]): string => {
  return entries
    .map((entry) => [
      `${entry.current ? '*' : ' '} ${entry.displayName} (${entry.model})`,
      `[${entry.providerName}]`,
      entry.local ? 'local' : 'cloud',
      entry.configuredProvider ? 'ready' : 'provider-needs-setup',
      entry.priceTier,
      `caps=${formatProviderCapabilities(getProviderCapabilities(entry.providerName, entry.model))}`,
      `roles=${entry.roles.join(',')}`,
      entry.notes ?? null,
    ].filter(Boolean).join(' | '))
    .join('\n');
};

export const recommendModels = (
  config: ApeironCodeConfig,
  registry: ProviderRegistry,
  role: ModelRole = 'coding',
): ModelCatalogEntry[] => {
  const statuses = new Map(listProviderStatuses(config, registry).map((status) => [status.name, status]));
  const affordabilityScore = (entry: ModelCatalogEntry): number => {
    const tier = getModelPriceTier(entry);
    return tier === 'free' ? 2 : tier === 'cheap' ? 1 : 0;
  };

  return listCatalogEntries(role)
    .filter((entry) => !config.localOnly || entry.capabilities.local)
    .sort((left, right) => Number(statuses.get(right.providerName)?.configured ?? false) - Number(statuses.get(left.providerName)?.configured ?? false)
      || Number(role === 'local' && right.capabilities.local) - Number(role === 'local' && left.capabilities.local)
      || Number(right.capabilities.local) - Number(left.capabilities.local)
      || affordabilityScore(right) - affordabilityScore(left));
};

export const formatModelRecommendations = (
  entries: ModelCatalogEntry[],
  role: ModelRole,
  config?: ApeironCodeConfig,
  registry?: ProviderRegistry,
): string => {
  if (entries.length === 0) {
    return `No catalog entries found for role ${role}.`;
  }

  const statuses = config && registry
    ? new Map(listProviderStatuses(config, registry).map((status) => [status.name, status]))
    : null;

  return [
    `Recommended models for ${role}:`,
    ...entries.slice(0, 5).map((entry) => {
      const status = statuses?.get(entry.providerName);
      const setupNote = status && !status.configured
        ? `setup-required${status.apiKeyEnvName ? ` (${status.apiKeyEnvName} missing)` : ''}`
        : 'ready';
      const ollamaHint = entry.providerName === 'ollama' ? ` | hint=ollama pull ${entry.model}` : '';
      return `- ${entry.displayName} (${entry.providerName}/${entry.model}) — ${entry.capabilities.local ? 'local' : 'cloud'} | ${setupNote}${ollamaHint} — ${entry.notes ?? 'No notes'}`;
    }),
  ].join('\n');
};

export const formatProviderCatalog = (): string => {
  const lines: string[] = [];
  lines.push('Provider Catalog\n');

  // Group by status
  const byStatus: Record<string, ProviderCatalogEntry[] | undefined> = {};
  for (const entry of listProviderCatalogEntries()) {
    if (!byStatus[entry.status]) {
      byStatus[entry.status] = [];
    }
    byStatus[entry.status]!.push(entry);
  }

  for (const status of ['stable', 'experimental', 'planned'] as const) {
    if (!byStatus[status]?.length) continue;

    lines.push(`## ${status.charAt(0).toUpperCase() + status.slice(1)}\n`);
    const statusEntries = byStatus[status];
    if (!statusEntries) continue;
    for (const entry of statusEntries) {
      const kind = entry.kind === 'openai-compatible' ? 'compatible' : entry.kind;
      const local = entry.capabilities.local ? '📍 local' : '☁️ cloud';
      const streaming = entry.capabilities.streaming ? '✓ streaming' : '✗ streaming';
      const tools = entry.capabilities.nativeToolCalling ? '✓ tool-call' : '✗ tool-call';

      // Check environment configuration status
      const envValidation = validateProviderEnv(entry.id);
      const envStatus = entry.id === 'mock' || entry.id === 'ollama'
        ? ''
        : envValidation.ok
          ? ' — ✓ env-configured'
          : ' — ✗ env-missing';

      lines.push(`- **${entry.displayName}** (${entry.id}) — ${kind} — ${local} — ${streaming} — ${tools}${envStatus}`);
      if (entry.recommendedModels.length > 0) {
        lines.push(`  Models: ${entry.recommendedModels.map((m: RecommendedModel) => m.id).join(', ')}`);
      }
      if (entry.auth.setupHint) {
        lines.push(`  Setup: ${entry.auth.setupHint}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const formatProviderSetupDetails = (providerId: string, config: ApeironCodeConfig): string => {
  const catalogEntry = getProviderCatalogEntry(providerId);
  if (!catalogEntry) {
    return `Provider ${providerId} not found in catalog.`;
  }

  const lines: string[] = [];
  lines.push(`## ${catalogEntry.displayName} (${catalogEntry.id})\n`);

  // Status
  lines.push(`Status: ${catalogEntry.status}`);
  lines.push(`Kind: ${catalogEntry.kind === 'openai-compatible' ? 'OpenAI Compatible' : catalogEntry.kind}`);
  lines.push('');

  // Authentication
  lines.push('### Authentication\n');
  if (catalogEntry.auth.type === 'none') {
    lines.push('No authentication required.');
  } else {
    lines.push(`Auth type: ${catalogEntry.auth.type}`);
    if (catalogEntry.auth.envVars) {
      lines.push(`Environment variables: ${catalogEntry.auth.envVars.join(', ')}`);
      for (const envVar of catalogEntry.auth.envVars) {
        const hasValue = Boolean(process.env[envVar]);
        lines.push(`  ${envVar}: ${hasValue ? 'set' : 'missing'}`);
      }
    }
  }
  if (catalogEntry.auth.setupHint) {
    lines.push(`\nSetup hint: ${catalogEntry.auth.setupHint}`);
  }
  lines.push('');

  // Recommended models
  if (catalogEntry.recommendedModels.length > 0) {
    lines.push('### Recommended Models\n');
    for (const model of catalogEntry.recommendedModels) {
      lines.push(`- **${model.label}** (${model.id})`);
      if (model.roles.length > 0) {
        lines.push(`  Roles: ${model.roles.join(', ')}`);
      }
      if (model.contextWindow) {
        lines.push(`  Context: ${model.contextWindow.toLocaleString()} tokens`);
      }
      if (model.notes) {
        lines.push(`  ${model.notes}`);
      }
    }
    lines.push('');
  }

  // Setup example
  lines.push('### Setup Steps\n');
  if (providerId === 'ollama') {
    lines.push('1. Install Ollama from https://ollama.ai');
    lines.push('2. Start the server: `ollama serve`');
    lines.push('3. Pull a model: `ollama pull qwen2.5-coder:7b`');
    lines.push('4. Verify connection: `apeironcode provider test --provider ollama --model qwen2.5-coder:7b`');
  } else if (providerId === 'mock') {
    lines.push('1. No setup required—mock provider is built-in');
    lines.push('2. Use with: `apeironcode config set provider mock && apeironcode config set model mock-coder`');
  } else if (providerId === 'openaiCompatible') {
    lines.push('1. Set base URL: `export OPENAI_COMPATIBLE_BASE_URL=http://your-server:port`');
    lines.push('2. Set API key: `export OPENAI_COMPATIBLE_API_KEY=your-key`');
    lines.push('3. Test: `apeironcode provider test --provider openaiCompatible --model your-model`');
  } else {
    if (catalogEntry.auth.envVars && catalogEntry.auth.envVars.length > 0) {
      for (const envVar of catalogEntry.auth.envVars) {
        lines.push(`1. Export ${envVar} in your shell`);
      }
    }
    lines.push(`2. Set as default: \`apeironcode config set provider ${providerId}\``);
    lines.push('3. Choose a model: `apeironcode model recommend coding`');
    lines.push('4. Set model: `apeironcode config set model <model>`');
  }

  if (catalogEntry.docsUrl) {
    lines.push(`\nDocs: ${catalogEntry.docsUrl}`);
  }

  return lines.join('\n');
};
