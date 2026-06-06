import type {ProviderCatalogEntry} from './catalog.js';

export const formatProviderCatalogEntry = (entry: ProviderCatalogEntry): string => {
  const lines: string[] = [];

  lines.push(`## ${entry.displayName} (${entry.id})`);
  lines.push(`Kind: ${entry.kind} | Status: ${entry.status}`);
  lines.push('');

  // Authentication
  lines.push('**Authentication:**');
  if (entry.auth.type === 'none') {
    lines.push('  No authentication required');
  } else if (entry.auth.envVars) {
    lines.push(`  Env vars: ${entry.auth.envVars.join(', ')}`);
  }
  if (entry.auth.setupHint) {
    lines.push(`  Setup: ${entry.auth.setupHint}`);
  }
  lines.push('');

  // Capabilities
  lines.push('**Capabilities:**');
  const caps: string[] = [];
  if (entry.capabilities.local) caps.push('local');
  if (entry.capabilities.streaming) caps.push('streaming');
  if (entry.capabilities.nativeToolCalling) caps.push('native-tools');
  if (entry.capabilities.jsonMode) caps.push('json-mode');
  if (entry.capabilities.vision) caps.push('vision');
  if (entry.capabilities.embeddings) caps.push('embeddings');
  if (entry.capabilities.costKnown) caps.push('cost-known');
  lines.push(`  ${caps.join(', ')}`);
  lines.push('');

  // Recommended models
  if (entry.recommendedModels.length > 0) {
    lines.push('**Recommended Models:**');
    for (const model of entry.recommendedModels) {
      lines.push(`  - ${model.label} (${model.id})`);
      if (model.roles.length > 0) {
        lines.push(`    Roles: ${model.roles.join(', ')}`);
      }
      if (model.contextWindow) {
        lines.push(`    Context: ${model.contextWindow.toLocaleString()} tokens`);
      }
      if (model.notes) {
        lines.push(`    ${model.notes}`);
      }
    }
    lines.push('');
  }

  if (entry.docsUrl) {
    lines.push(`**Docs:** ${entry.docsUrl}`);
  }

  return lines.join('\n');
};

export const formatProviderCatalogList = (entries: ProviderCatalogEntry[]): string => {
  const lines: string[] = [];

  lines.push('**Provider Catalog**\n');

  // Group by status and kind
  const byStatus: Record<string, ProviderCatalogEntry[] | undefined> = {};
  for (const entry of entries) {
    if (!byStatus[entry.status]) {
      byStatus[entry.status] = [];
    }
    byStatus[entry.status]!.push(entry);
  }

  for (const status of ['stable', 'experimental', 'planned'] as const) {
    if (!byStatus[status]?.length) continue;

    lines.push(`### ${status.charAt(0).toUpperCase() + status.slice(1)}\n`);
    const statusEntries = byStatus[status];
    if (!statusEntries) continue;
    for (const entry of statusEntries) {
      const kind = entry.kind === 'openai-compatible' ? 'compatible' : entry.kind;
      const local = entry.capabilities.local ? '📍' : '☁️ ';
      const models = entry.recommendedModels.length > 0 ? `${entry.recommendedModels.length} models` : 'N/A';
      lines.push(`${local} **${entry.displayName}** (${entry.id}) — ${kind} — ${models}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

export const formatProvidersForRole = (entries: ProviderCatalogEntry[], role: string): string => {
  const lines: string[] = [];

  lines.push(`**Providers for ${role} role:**\n`);

  const providers = entries.filter((entry) =>
    entry.recommendedModels.some((model) =>
      model.roles.includes(role as never),
    ),
  );

  if (providers.length === 0) {
    lines.push('No providers found for this role.');
    return lines.join('\n');
  }

  for (const provider of providers) {
    const local = provider.capabilities.local ? '(local)' : '(cloud)';
    lines.push(`${provider.displayName} ${local}`);
    const models = provider.recommendedModels.filter((m) => m.roles.includes(role as never));
    for (const model of models) {
      lines.push(`  - ${model.label}`);
    }
  }

  return lines.join('\n');
};
