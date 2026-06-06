/**
 * First-run detection for ApeironCode startup wizard.
 * Determines whether to show the setup prompt based on provider/model state,
 * environment, and CLI flags. Does NOT perform any I/O.
 */

const MOCK_PROVIDERS = new Set(['mock']);
const MOCK_MODELS = new Set(['mock-coder']);

const NON_INTERACTIVE_SUBCOMMANDS = new Set([
  'doctor',
  'help',
  'bridge',
  'version',
  '--version',
  '-V',
  '--help',
  '-h',
]);

export interface FirstRunConfig {
  defaultProvider?: string;
  defaultModel?: string;
  hasUserConfigFile?: boolean;
}

export interface FirstRunEnv {
  CI?: string;
  APEIRONCODE_NO_SETUP?: string;
  [key: string]: string | undefined;
}

export interface FirstRunOptions {
  noSetup?: boolean;
  argv?: string[];
}

export interface FirstRunState {
  isFirstRun: boolean;
  reason: string;
  provider: string;
  model: string;
}

/**
 * Detect whether this looks like a first-run situation that needs setup.
 */
export const detectFirstRunState = (
  config: FirstRunConfig,
  env: FirstRunEnv = {},
): FirstRunState => {
  const provider = config.defaultProvider ?? '';
  const model = config.defaultModel ?? '';
  // Allow env-based override for testing/scripts
  const hasConfig = config.hasUserConfigFile ?? (env.APEIRONCODE_CONFIG_PATH !== undefined ? true : false);

  const isMockProvider = MOCK_PROVIDERS.has(provider);
  const isMockModel = MOCK_MODELS.has(model);
  const isConfigMissing = !hasConfig;

  const isFirstRun = isMockProvider || isMockModel || isConfigMissing;

  let reason = 'ok';
  if (isConfigMissing) {
    reason = 'no-config';
  } else if (isMockProvider) {
    reason = 'mock-provider';
  } else if (isMockModel) {
    reason = 'mock-model';
  }

  return {isFirstRun, model, provider, reason};
};

/**
 * Whether to actually show the setup wizard given the current state and options.
 * Returns false for CI, non-interactive subcommands, and --no-setup.
 */
export const shouldShowFirstRunSetup = (
  state: FirstRunState,
  options: FirstRunOptions = {},
): boolean => {
  if (!state.isFirstRun) {
    return false;
  }

  // Respect explicit --no-setup flag
  if (options.noSetup) {
    return false;
  }

  // Detect CI environment
  const argv = options.argv ?? process.argv;
  const env = process.env;
  if (
    env.CI === '1' ||
    env.CI === 'true' ||
    env.APEIRONCODE_NO_SETUP === '1' ||
    env.CONTINUOUS_INTEGRATION === 'true'
  ) {
    return false;
  }

  // Detect non-interactive subcommands
  for (const arg of argv.slice(2)) {
    if (NON_INTERACTIVE_SUBCOMMANDS.has(arg)) {
      return false;
    }
  }

  return true;
};

/**
 * Format a human-readable explanation of why first-run was triggered.
 */
export const formatFirstRunReason = (state: FirstRunState): string => {
  switch (state.reason) {
    case 'no-config':
      return 'No configuration file found. Run `apeironcode setup` to choose a provider.';
    case 'mock-provider':
      return `Provider is set to Mock (testing only). Run \`apeironcode setup\` to choose a real provider.`;
    case 'mock-model':
      return `Model is set to Mock (testing only). Run \`apeironcode setup\` to choose a real model.`;
    default:
      return 'Provider and model are configured.';
  }
};
