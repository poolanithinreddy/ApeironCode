import {getProviderCatalogEntry, type ProviderCatalogEntry} from './catalog.js';
import {getProviderCapabilities, type ProviderCapabilities} from './modelCatalog.js';

export interface ResolvedProviderCapabilities extends ProviderCapabilities {
  providerStatus?: ProviderCatalogEntry['status'];
}

export const resolveProviderCapabilities = (
  providerName: string,
  model: string,
): ResolvedProviderCapabilities => {
  const catalogEntry = getProviderCatalogEntry(providerName);
  return {
    ...getProviderCapabilities(providerName, model),
    providerStatus: catalogEntry?.status,
  };
};
