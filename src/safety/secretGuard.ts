const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/u,
  /(^|\/)\.npmrc$/u,
  /(^|\/)\.ssh(\/|$)/u,
  /(^|\/)\.aws(\/|$)/u,
  /(^|\/)\.gnupg(\/|$)/u,
  /(^|\/)id_(rsa|ed25519)$/u,
  /\.(pem|key|p12)$/u,
];

export const isSensitivePath = (filePath: string): boolean => {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
};