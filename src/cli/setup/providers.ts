import {providerRegistry, type ProviderRegistry} from '../../providers/registry.js';

export interface ProviderSetupResult {
  ok: boolean;
  registry: ProviderRegistry;
}

export const initializeProviderRegistry = (registry: ProviderRegistry = providerRegistry): ProviderRegistry => {
  return registry;
};

export const validateProviderRegistry = (registry: ProviderRegistry = providerRegistry): ProviderSetupResult => {
  return {
    ok: registry.listProviderNames().length > 0,
    registry,
  };
};
