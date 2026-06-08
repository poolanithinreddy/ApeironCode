const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'set-cookie',
]);

const SENSITIVE_ENV_KEYS = [
  'TOKEN',
  'SECRET',
  'KEY',
  'PASSWORD',
  'CREDENTIAL',
];

const isSensitiveEnvKey = (key: string): boolean => {
  const upper = key.toUpperCase();
  return SENSITIVE_ENV_KEYS.some((needle) => upper.includes(needle));
};

export const redactHeaders = (headers: Record<string, string> | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
};

export const redactEnv = (env: Record<string, string> | undefined): Record<string, string> => {
  if (!env) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = isSensitiveEnvKey(key) ? '[REDACTED]' : value;
  }
  return out;
};

export const redactString = (text: string, secrets: Array<string | undefined | null>): string => {
  let result = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) {
      continue;
    }
    result = result.split(secret).join('[REDACTED]');
  }
  return result;
};
