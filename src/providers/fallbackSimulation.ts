import type {ApeironCodeConfig} from '../config/config.js';
import {classifyProviderError, type ProviderFailureKind} from './errorClassification.js';
import {resolveProviderChain, type ProviderFallbackEntry, type ProviderFallbackRole} from './fallbacks.js';

export type ProviderFallbackSimulationKind =
  | 'invalid-response'
  | 'malformed-tool-call'
  | 'missing-key'
  | 'rate-limit'
  | 'timeout';

export interface ProviderFallbackSimulation {
  autoFallback: boolean;
  classification: ReturnType<typeof classifyProviderError>;
  failedProvider: string;
  kind: ProviderFailureKind;
  localOnly: boolean;
  role: ProviderFallbackRole;
  selected?: ProviderFallbackEntry;
  suggested?: ProviderFallbackEntry;
}

const simulatedErrors: Record<ProviderFallbackSimulationKind, Error> = {
  'invalid-response': new Error('invalid response: expected JSON object'),
  'malformed-tool-call': new Error('malformed tool call: missing name'),
  'missing-key': new Error('missing API key'),
  'rate-limit': new Error('429 rate limit exceeded'),
  timeout: new Error('provider request timeout'),
};

export const simulateProviderFallback = (
  config: ApeironCodeConfig,
  kind: ProviderFallbackSimulationKind,
  role: ProviderFallbackRole = 'coding',
): ProviderFallbackSimulation => {
  const classification = classifyProviderError(simulatedErrors[kind]);
  const plan = resolveProviderChain(role, config, process.env);
  const failedKey = `${config.defaultProvider}:${config.defaultModel}`;
  const suggested = plan.entries.find((entry) =>
    entry.available && `${entry.ref.provider}:${entry.ref.model}` !== failedKey,
  );
  return {
    autoFallback: plan.autoFallback,
    classification,
    failedProvider: failedKey,
    kind: classification.kind,
    localOnly: config.localOnly,
    role: plan.role,
    selected: plan.autoFallback ? suggested : undefined,
    suggested,
  };
};

export const formatProviderFallbackSimulation = (simulation: ProviderFallbackSimulation): string => [
  `Provider fallback simulation: ${simulation.kind}`,
  `Role: ${simulation.role}`,
  `Failed provider: ${simulation.failedProvider}`,
  `Classification: ${simulation.classification.kind} (${simulation.classification.summary})`,
  `Retryable: ${simulation.classification.retryable ? 'yes' : 'no'}`,
  `localOnly: ${simulation.localOnly ? 'yes' : 'no'}`,
  `autoFallback: ${simulation.autoFallback ? 'true' : 'false'}`,
  simulation.selected
    ? `Simulated switch: ${simulation.selected.ref.provider}:${simulation.selected.ref.model}`
    : simulation.suggested
      ? `Suggested fallback: ${simulation.suggested.ref.provider}:${simulation.suggested.ref.model}`
      : 'Suggested fallback: none available',
  simulation.autoFallback
    ? 'Runtime behavior: would record a fallback event and retry with the selected fallback.'
    : 'Runtime behavior: would stop, preserve the session event, and show this fallback suggestion.',
].join('\n');

