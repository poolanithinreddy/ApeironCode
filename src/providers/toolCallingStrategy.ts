import {getProviderCatalogEntry, type ProviderCatalogEntry} from './catalog.js';
import {getProviderCapabilities} from './modelCatalog.js';

export type ToolCallingStrategy =
  | 'native-tool-calling'
  | 'json-block'
  | 'apeironcode-tool-call-tag'
  | 'plain-text-no-tools';

export const getToolCallingStrategy = (
  providerName: string,
  model: string,
  catalog: ProviderCatalogEntry[] = [],
): ToolCallingStrategy => {
  const catalogEntry = catalog.find((entry) => entry.id === providerName) ?? getProviderCatalogEntry(providerName);
  const capabilities = getProviderCapabilities(providerName, model);

  if (!catalogEntry) {
    return 'plain-text-no-tools';
  }

  if (capabilities.nativeToolCalling) {
    return 'native-tool-calling';
  }

  if (capabilities.jsonMode && !capabilities.local) {
    return 'json-block';
  }

  if (capabilities.local || providerName === 'mock' || providerName === 'ollama') {
    return capabilities.jsonMode ? 'json-block' : 'apeironcode-tool-call-tag';
  }

  return 'plain-text-no-tools';
};

export const formatToolCallingStrategy = (strategy: ToolCallingStrategy): string => {
  switch (strategy) {
    case 'native-tool-calling':
      return 'Tool strategy: native tool calling is supported.';
    case 'json-block':
      return 'Tool strategy: use compact JSON blocks for tool requests.';
    case 'apeironcode-tool-call-tag':
      return 'Tool strategy: native tools are unavailable; prefer concise plain-text guidance over ad hoc tool directives.';
    case 'plain-text-no-tools':
      return 'Tool strategy: avoid tool-heavy prompt sections and answer in plain text unless a tool call is essential.';
  }
};
