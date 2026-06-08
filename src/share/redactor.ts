/**
 * Redacts sensitive information from exported session data.
 */

const REDACTION_PATTERNS = [
  {
    name: 'api_key',
    pattern: /api[_-]?key[=:]\s*['"]?([^'"}\s]+)['"]?/gi,
    replace: 'api_key=[REDACTED]',
  },
  {
    name: 'bearer_token',
    pattern: /bearer\s+([a-zA-Z0-9_.-]+)/gi,
    replace: 'bearer [REDACTED]',
  },
  {
    name: 'password',
    pattern: /password[=:]\s*['"]?([^'"}\s]+)['"]?/gi,
    replace: 'password=[REDACTED]',
  },
  {
    name: 'token',
    pattern: /token[=:]\s*['"]?([a-zA-Z0-9_.-]+)['"]?/gi,
    replace: 'token=[REDACTED]',
  },
  {
    name: 'auth',
    pattern: /authorization[=:]\s*['"]?(.+?)['"]?(?=\s|$|[,;}])/gi,
    replace: 'authorization=[REDACTED]',
  },
  {
    name: 'env_value',
    pattern: /^([A-Z_]+)=(.+)$/gm,
    replace: '[REDACTED VALUE]',
  },
  {
    name: 'private_key',
    pattern: /-----BEGIN (RSA|DSA|EC|PGP).*?-----END \1.*?-----/gs,
    replace: '[REDACTED PRIVATE KEY]',
  },
  {
    // Anthropic, OpenAI, and similar sk-* style API keys
    name: 'sk_key',
    pattern: /\bsk-[a-zA-Z0-9_-]{16,}\b/g,
    replace: '[REDACTED]',
  },
];

export const redactSecrets = (text: string): string => {
  let result = text;

  for (const {pattern, replace} of REDACTION_PATTERNS) {
    result = result.replace(pattern, replace);
  }

  return result;
};

export const redactObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Redact keys that look like secrets
    if (/secret|token|key|password|auth/i.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
};
