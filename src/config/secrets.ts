import type {ApeironCodeConfig} from './config.js';

export const resolveProviderApiKey = (
  providerName: string,
  config: ApeironCodeConfig,
): string | null => {
  const envName = config.apiKeyEnvNames[providerName];
  if (!envName) {
    return null;
  }

  return process.env[envName] ?? null;
};

export const redactSecret = (value: string | null): string => {
  if (!value) {
    return 'not set';
  }

  if (value.length <= 8) {
    return '********';
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};