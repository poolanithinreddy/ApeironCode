import type {ResolvedConfig} from '../../config/config.js';
import type {ToolRegistry} from '../../tools/registry.js';
import type {ProviderRegistry} from '../../providers/registry.js';

export interface BootstrapContext {
  config: ResolvedConfig;
  cwd: string;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistry;
}

export interface SetupStepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface SetupResult {
  context: BootstrapContext;
  steps: SetupStepResult[];
}
