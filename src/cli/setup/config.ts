import {ConfigStore, type ResolvedConfig} from '../../config/config.js';

export interface ConfigSetupOptions {
  cwd: string;
  configStore?: ConfigStore;
}

export const createBootstrapConfigStore = (cwd: string): ConfigStore => {
  return new ConfigStore(cwd);
};

export const loadBootstrapConfig = async ({
  cwd,
  configStore = createBootstrapConfigStore(cwd),
}: ConfigSetupOptions): Promise<ResolvedConfig> => {
  return configStore.load();
};
