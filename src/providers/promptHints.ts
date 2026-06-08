import {formatProviderCapabilities, type ProviderCapabilities} from './modelCatalog.js';
import {PROVIDER_CATALOG} from './catalog.js';
import {formatToolCallingStrategy, getToolCallingStrategy} from './toolCallingStrategy.js';

export const buildProviderPromptHints = ({
  capabilities,
  model,
  providerName,
}: {
  capabilities: ProviderCapabilities;
  model: string;
  providerName: string;
}): string => {
  const lines = [
    `Active model profile: ${providerName}/${model} (${formatProviderCapabilities(capabilities)}).`,
    formatToolCallingStrategy(getToolCallingStrategy(providerName, model, PROVIDER_CATALOG)),
  ];

  if (!capabilities.nativeToolCalling) {
    lines.push('When tool use is unavailable or degraded, ask for the smallest needed context and respond in concise Markdown rather than inventing tool directives.');
  }

  if (capabilities.local && (capabilities.contextWindow ?? 0) <= 64_000) {
    lines.push('This is a local or smaller-context model. Prefer narrow file reads and avoid requesting broad repo context unless the task truly needs it.');
  }

  if ((capabilities.contextWindow ?? 0) >= 200_000) {
    lines.push('Large context is available, but still prioritize the smallest relevant files first so the response stays precise.');
  }

  if (!capabilities.streaming) {
    lines.push('Responses may arrive in larger buffered chunks, so keep intermediate progress updates explicit after tool calls.');
  }

  if (!capabilities.nativeToolCalling && !capabilities.jsonMode) {
    lines.push('Use a compact tool schema and retry malformed native tool inputs only within the configured retry cap.');
  }

  return lines.join('\n');
};
