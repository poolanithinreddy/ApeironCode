/**
 * Bridge payload redaction and sanitization.
 * Never mutates input, never exposes secrets in bridge messages.
 */

import type {BridgeMessage} from './types.js';

const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 5;

/** Fields that are safe to preserve even if they look like key=value pairs. */
const SAFE_FIELD_NAMES = new Set([
  'id', 'taskId', 'sessionId', 'worktreeId', 'type', 'status', 'kind',
  'filePath', 'path', 'toolName', 'name', 'branchName', 'label',
  'timestamp', 'createdAt', 'updatedAt', 'count', 'total', 'iteration',
  'toolCallCount', 'messageCount', 'errorCount', 'permissionCount',
  'providerId', 'modelId', 'stored',
]);

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{16,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /bearer\s+[a-zA-Z0-9._-]{20,}/gi,
  /api[_-]?key[=:]\s*['"]?[a-zA-Z0-9._-]{8,}/gi,
  /password[=:]\s*['"]?[^\s'"]{4,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const containsSecret = (value: string): boolean =>
  SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(value);
  });

const redactString = (value: string): string => {
  if (value.length > MAX_STRING_LENGTH) {
    return value.slice(0, MAX_STRING_LENGTH) + '…[truncated]';
  }
  if (containsSecret(value)) return '[REDACTED]';
  return value;
};

/**
 * Deep-redact a value for safe inclusion in a bridge message.
 * Returns a new value — never mutates the input.
 */
export const redactBridgePayload = (
  value: unknown,
  depth = 0,
): unknown => {
  if (depth > MAX_DEPTH) return '[depth limit]';

  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_LENGTH);
    const redacted = limited.map((item) => redactBridgePayload(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      return [...redacted, `…${value.length - MAX_ARRAY_LENGTH} more`];
    }
    return redacted;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const isSafeField = SAFE_FIELD_NAMES.has(key);
      if (isSafeField && typeof val !== 'object') {
        result[key] = typeof val === 'string' ? val.slice(0, 500) : val;
      } else {
        result[key] = redactBridgePayload(val, depth + 1);
      }
    }
    return result;
  }

  return '[unsupported type]';
};

/**
 * Returns a sanitized copy of a bridge message with payload redacted.
 * Does not mutate the original.
 */
export const sanitizeBridgeMessage = (message: BridgeMessage): BridgeMessage => ({
  ...message,
  payload: redactBridgePayload(message.payload) as Record<string, unknown>,
});

export interface PayloadPreviewOptions {
  maxLength?: number;
  depth?: number;
}

/**
 * Formats a compact preview of a payload for display.
 * Safe for logs and CLI output.
 */
export const formatBridgePayloadPreview = (
  value: unknown,
  options: PayloadPreviewOptions = {},
): string => {
  const maxLength = options.maxLength ?? 300;
  const sanitized = redactBridgePayload(value, 0);
  const raw = JSON.stringify(sanitized, null, 0);
  if (raw.length <= maxLength) return raw;
  return raw.slice(0, maxLength) + '…';
};
