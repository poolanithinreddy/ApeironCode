import {isSensitivePath} from '../../safety/secretGuard.js';

const SENSITIVE_TEXT_PATTERNS = [
  /(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|bearer)\s*[:=]/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9]{20,}\b/u,
];

const MEMORY_PLACEHOLDERS = new Set([
  'none',
  'none yet',
  'not documented',
  'not specified',
]);

export const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/gu, ' ');

export const containsSensitiveMemoryContent = (value: string): boolean => {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
};

export const filterSensitiveMemoryFiles = (values: string[]): string[] => {
  return values.filter((value) => !isSensitivePath(value));
};

export const sanitizeText = (value: string | undefined | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || containsSensitiveMemoryContent(trimmed) || MEMORY_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    return undefined;
  }

  return trimmed;
};

export const uniqueStrings = (values: Array<string | undefined | null>, limit = 20): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const sanitized = sanitizeText(value);
    if (!sanitized) {
      continue;
    }

    const normalized = normalizeWhitespace(sanitized);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
};
