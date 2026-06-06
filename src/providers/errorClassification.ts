export type ProviderFailureKind =
  | 'invalid-response'
  | 'malformed-tool-call'
  | 'missing-key'
  | 'model-unavailable'
  | 'network'
  | 'rate-limit'
  | 'timeout'
  | 'tool-call-unsupported'
  | 'unknown';

export interface ProviderFailureClassification {
  kind: ProviderFailureKind;
  retryable: boolean;
  summary: string;
}

export const classifyProviderError = (error: unknown): ProviderFailureClassification => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (/api key|token|unauthorized|401|missing key/u.test(normalized)) {
    return {kind: 'missing-key', retryable: true, summary: 'provider credential is missing or invalid'};
  }
  if (/rate limit|429|too many requests/u.test(normalized)) {
    return {kind: 'rate-limit', retryable: true, summary: 'provider rate limit'};
  }
  if (/timeout|timed out|deadline/u.test(normalized)) {
    return {kind: 'timeout', retryable: true, summary: 'provider timeout'};
  }
  if (/network|econn|enotfound|timeout|fetch failed|socket/u.test(normalized)) {
    return {kind: 'network', retryable: true, summary: 'network failure'};
  }
  if (/model.*(not found|unavailable|unsupported)|404/u.test(normalized)) {
    return {kind: 'model-unavailable', retryable: true, summary: 'model unavailable'};
  }
  if (/tool.*unsupported|function.*unsupported/u.test(normalized)) {
    return {kind: 'tool-call-unsupported', retryable: true, summary: 'tool calling unsupported'};
  }
  if (/malformed tool|bad tool call|invalid tool call/u.test(normalized)) {
    return {kind: 'malformed-tool-call', retryable: true, summary: 'malformed tool call'};
  }
  if (/invalid json|invalid response|malformed/u.test(normalized)) {
    return {kind: 'invalid-response', retryable: true, summary: 'invalid provider response'};
  }
  return {kind: 'unknown', retryable: true, summary: message};
};
