import fs from 'node:fs/promises';

import type {ConfigStore, ApeironCodeConfigInput, ResolvedConfig} from '../config/config.js';
import {fileExists} from '../utils/fs.js';
import {getGlobalConfigPath} from '../utils/paths.js';

export type SetupProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'github-models'
  | 'mock'
  | 'ollama'
  | 'openrouter'
  | 'openaiCompatible';

export interface SetupOptions {
  local?: boolean;
  provider?: string;
}

export interface SetupResetOptions {
  dryRun?: boolean;
}

export interface SetupStatus {
  approvalMode: string;
  configExists: boolean;
  configPath: string;
  defaultModel: string;
  defaultProvider: string;
  localOnly: boolean;
  nextSteps: string[];
}

const providerProfiles: Record<SetupProvider, ApeironCodeConfigInput> = {
  anthropic: {
    apiKeyEnvNames: {anthropic: 'ANTHROPIC_API_KEY'},
    defaultModel: 'claude-sonnet-4-20250514',
    defaultProvider: 'anthropic',
    localOnly: false,
  },
  openai: {
    apiKeyEnvNames: {openai: 'OPENAI_API_KEY'},
    defaultModel: 'gpt-4o',
    defaultProvider: 'openai',
    localOnly: false,
  },
  groq: {
    apiKeyEnvNames: {groq: 'GROQ_API_KEY'},
    defaultModel: 'llama-3.1-70b-versatile',
    defaultProvider: 'groq',
    localOnly: false,
  },
  'github-models': {
    apiKeyEnvNames: {'github-models': 'GITHUB_TOKEN'},
    baseUrls: {'github-models': 'https://models.github.ai/inference'},
    defaultModel: 'openai/gpt-4.1',
    defaultProvider: 'github-models',
    localOnly: false,
  },
  gemini: {
    apiKeyEnvNames: {gemini: 'GEMINI_API_KEY'},
    defaultModel: 'gemini-2.5-flash',
    defaultProvider: 'gemini',
    localOnly: false,
  },
  mock: {
    approvalMode: 'ask',
    defaultModel: 'mock-coder',
    defaultProvider: 'mock',
    localOnly: true,
  },
  ollama: {
    approvalMode: 'ask',
    defaultModel: 'qwen2.5-coder:7b',
    defaultProvider: 'ollama',
    localOnly: true,
  },
  openaiCompatible: {
    defaultModel: 'gpt-4.1-mini',
    defaultProvider: 'openaiCompatible',
    localOnly: false,
  },
  openrouter: {
    defaultModel: 'qwen/qwen-2.5-coder-32b-instruct',
    defaultProvider: 'openrouter',
    localOnly: false,
  },
};

const normalizeSetupProvider = (provider?: string, local = false): SetupProvider => {
  if (local) {
    return 'ollama';
  }
  if (provider && provider in providerProfiles) {
    return provider as SetupProvider;
  }
  return 'mock';
};

export const applySetupProfile = async (
  configStore: ConfigStore,
  options: SetupOptions = {},
): Promise<SetupStatus> => {
  const provider = normalizeSetupProvider(options.provider, options.local);
  await configStore.patchUserConfig(providerProfiles[provider]);
  return getSetupStatus(configStore);
};

export const getSetupStatus = async (configStore: ConfigStore): Promise<SetupStatus> => {
  const configPath = getGlobalConfigPath();
  const [configExists, resolved] = await Promise.all([
    fileExists(configPath),
    configStore.load(),
  ]);
  return buildSetupStatus(configExists, configPath, resolved);
};

export const resetSetup = async (
  _configStore: ConfigStore,
  options: SetupResetOptions = {},
): Promise<{configPath: string; deleted: boolean; dryRun: boolean}> => {
  const configPath = getGlobalConfigPath();
  const exists = await fileExists(configPath);
  if (!options.dryRun && exists) {
    await fs.rm(configPath, {force: true});
  }
  return {
    configPath,
    deleted: exists && !options.dryRun,
    dryRun: Boolean(options.dryRun),
  };
};

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'github-models': 'GITHUB_TOKEN',
};

const hasEnv = (name: string, env: Record<string, string | undefined>): boolean => {
  const value = env[name];
  return Boolean(value && value.trim().length > 0);
};

const keyProviderNextSteps = (
  provider: string,
  envVar: string,
  env: Record<string, string | undefined>,
): string[] => {
  if (hasEnv(envVar, env)) {
    return [`${envVar} detected in environment — ${provider} is configured and ready.`];
  }
  return [`Export ${envVar} before running model calls (${provider} is not ready until then).`];
};

const providerNextSteps = (
  config: ResolvedConfig['effective'],
  env: Record<string, string | undefined> = process.env,
): string[] => {
  const provider = config.defaultProvider;
  const envVar = PROVIDER_ENV_VARS[provider];
  if (envVar) {
    return keyProviderNextSteps(provider, envVar, env);
  }
  switch (provider) {
    case 'mock':
      return [
        'Run `apeironcode "explain this repo"` to try the product without an API key.',
        'Use `/commands beginner` in the TUI for the short command list.',
      ];
    case 'ollama':
      return [
        'Run `ollama serve` if Ollama is not already running.',
        `Run \`ollama pull ${config.defaultModel}\` if the model is missing.`,
      ];
    case 'openaiCompatible':
      return ['Set OPENAI_API_KEY and configure baseUrl if your endpoint is not OpenAI.'];
    default:
      return ['Run `apeironcode provider list` and `apeironcode model recommend coding`.'];
  }
};

const buildSetupStatus = (
  configExists: boolean,
  configPath: string,
  resolved: ResolvedConfig,
): SetupStatus => ({
  approvalMode: resolved.effective.approvalMode,
  configExists,
  configPath,
  defaultModel: resolved.effective.defaultModel,
  defaultProvider: resolved.effective.defaultProvider,
  localOnly: resolved.effective.localOnly,
  nextSteps: providerNextSteps(resolved.effective),
});

export const formatSetupStatus = (status: SetupStatus): string => [
  'Setup status',
  `Config: ${status.configExists ? 'configured' : 'not configured'} (${status.configPath})`,
  `Provider/model: ${status.defaultProvider}/${status.defaultModel}`,
  `Approval mode: ${status.approvalMode}`,
  `Local only: ${status.localOnly ? 'yes' : 'no'}`,
  '',
  'Next steps:',
  ...status.nextSteps.map((step) => `- ${step}`),
].join('\n');

export const formatSetupResult = (status: SetupStatus): string => [
  'Setup complete',
  '',
  formatSetupStatus(status),
  '',
  'No secrets were stored. API keys should stay in environment variables.',
].join('\n');
