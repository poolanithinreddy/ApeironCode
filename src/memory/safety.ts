export interface SecretDetection {
  label: string;
  pattern: RegExp;
  redactValue?: boolean;
}

const SECRET_PATTERNS: SecretDetection[] = [
  {label: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu},
  {label: 'env secret', pattern: /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*["']?[^"'\s]+/giu},
  {label: 'aws access key', pattern: /\bAKIA[0-9A-Z]{16}\b/gu},
  {label: 'aws secret key', pattern: /\baws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}/giu},
  {label: 'github token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/gu},
  {label: 'openai token', pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/gu},
  {label: 'slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu},
  {label: 'bearer token', pattern: /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/giu},
  {label: 'ssh private key hint', pattern: /\bOPENSSH PRIVATE KEY\b/gu},
];

const resetPattern = (pattern: RegExp): RegExp => {
  pattern.lastIndex = 0;
  return pattern;
};

export const detectSecretLikeContent = (value: string): string[] => {
  const labels: string[] = [];
  for (const detection of SECRET_PATTERNS) {
    if (resetPattern(detection.pattern).test(value)) {
      labels.push(detection.label);
    }
  }
  return Array.from(new Set(labels));
};

export const containsSecretLikeContent = (value: string): boolean => detectSecretLikeContent(value).length > 0;

export const redactSecretLikeContent = (value: string): string => {
  let redacted = value;
  for (const detection of SECRET_PATTERNS) {
    redacted = redacted.replace(resetPattern(detection.pattern), '[REDACTED_SECRET]');
  }
  return redacted;
};

export const isMostlySecretMaterial = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const redacted = redactSecretLikeContent(trimmed);
  const redactionCount = (redacted.match(/\[REDACTED_SECRET\]/gu) ?? []).length;
  const meaningfulText = redacted.replace(/\[REDACTED_SECRET\]/gu, '').replace(/[^a-z0-9]/giu, '');
  return redactionCount > 0 && meaningfulText.length < 20;
};
