/**
 * Provider Setup Wizard data/formatting module for ApeironCode.
 * Provides provider metadata, key masking, env detection, and formatted output.
 * Does NOT perform any interactive I/O — that is the caller's responsibility.
 */

export interface ProviderInfo {
  id: string;
  displayName: string;
  envVar: string | null;
  isFree: boolean;
  isLocal: boolean;
  bestUse: string;
  setupHint: string;
}

export interface ConfiguredProviderStatus {
  providerId: string;
  configured: boolean;
  envVar: string | null;
  display: string;
}

export interface WizardSelections {
  provider: string;
  model?: string;
  apiKeyMasked?: string;
}

const PROVIDER_LIST: ProviderInfo[] = [
  {
    id: 'ollama',
    displayName: 'Ollama (local)',
    envVar: null,
    isFree: true,
    isLocal: true,
    bestUse: 'Privacy-first local coding — no cloud, no API key required',
    setupHint: 'Run `ollama serve` then optionally set OLLAMA_BASE_URL',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    envVar: 'ANTHROPIC_API_KEY',
    isFree: false,
    isLocal: false,
    bestUse: 'Advanced reasoning, coding, and long-context tasks',
    setupHint: 'Export ANTHROPIC_API_KEY=<your-key>',
  },
  {
    id: 'openai',
    displayName: 'OpenAI (GPT-4)',
    envVar: 'OPENAI_API_KEY',
    isFree: false,
    isLocal: false,
    bestUse: 'General-purpose coding and reasoning with wide ecosystem support',
    setupHint: 'Export OPENAI_API_KEY=<your-key>',
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    isFree: false,
    isLocal: false,
    bestUse: 'Multimodal tasks, long-context analysis, and Google ecosystem',
    setupHint: 'Export GEMINI_API_KEY=<your-key>',
  },
  {
    id: 'groq',
    displayName: 'Groq (fast inference)',
    envVar: 'GROQ_API_KEY',
    isFree: false,
    isLocal: false,
    bestUse: 'Ultra-fast inference for Llama/Mistral models',
    setupHint: 'Export GROQ_API_KEY=<your-key>',
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter (multi-model)',
    envVar: 'OPENROUTER_API_KEY',
    isFree: false,
    isLocal: false,
    bestUse: 'Access many models through a single API key',
    setupHint: 'Export OPENROUTER_API_KEY=<your-key>',
  },
  {
    id: 'github-models',
    displayName: 'GitHub Models (free tier)',
    envVar: 'GITHUB_TOKEN',
    isFree: true,
    isLocal: false,
    bestUse: 'Free GitHub-hosted inference for common models',
    setupHint: 'Export GITHUB_TOKEN from your GitHub account',
  },
  {
    id: 'mock',
    displayName: 'Mock (testing only)',
    envVar: null,
    isFree: true,
    isLocal: true,
    bestUse: 'Deterministic responses for CI and automated tests',
    setupHint: 'No setup needed — for development and testing only',
  },
];

/**
 * Returns the full list of provider info objects.
 */
export const listProviderOptions = (): ProviderInfo[] => [...PROVIDER_LIST];

/**
 * Masks an API key so it never appears in full in output.
 * Returns 'sk-...XXXX' style redaction.
 */
export const maskApiKey = (key: string): string => {
  if (!key || key.length < 8) {
    return '[REDACTED]';
  }
  const prefix = key.startsWith('sk-') ? 'sk-' : key.slice(0, 3);
  return `${prefix}...${key.slice(-4)}`;
};

/**
 * Checks environment variables to determine which providers are configured.
 */
export const detectConfiguredProviders = (env: Record<string, string | undefined>): Map<string, boolean> => {
  const result = new Map<string, boolean>();
  for (const provider of PROVIDER_LIST) {
    if (provider.envVar === null) {
      // Local or no-key providers are always available
      result.set(provider.id, true);
    } else {
      const value = env[provider.envVar];
      result.set(provider.id, Boolean(value && value.trim().length > 0));
    }
  }
  return result;
};

/**
 * Formats a single provider choice with configured/missing status.
 */
export const formatProviderChoice = (
  provider: ProviderInfo,
  env: Record<string, string | undefined>,
): ConfiguredProviderStatus => {
  let configured = true;
  let display: string;

  if (provider.envVar === null) {
    display = `${provider.displayName}  [ready]`;
  } else {
    const value = env[provider.envVar];
    configured = Boolean(value && value.trim().length > 0);
    const statusTag = configured ? '[configured]' : '[key missing]';
    display = `${provider.displayName}  ${statusTag}`;
  }

  return {
    providerId: provider.id,
    configured,
    envVar: provider.envVar,
    display,
  };
};

/**
 * Formats a complete provider setup wizard summary (non-interactive output).
 */
export const formatWizardOutput = (selections: WizardSelections): string => {
  const lines: string[] = [
    'ApeironCode — Provider Setup',
    '',
    `  Provider : ${selections.provider}`,
  ];

  if (selections.model) {
    lines.push(`  Model    : ${selections.model}`);
  }

  if (selections.apiKeyMasked) {
    lines.push(`  API Key  : ${selections.apiKeyMasked}`);
  }

  lines.push('', 'Setup complete. Run `apeironcode` to start coding.');
  return lines.join('\n');
};

/**
 * Formats the provider list for display (e.g., in setup status output).
 */
export const formatProviderList = (
  env: Record<string, string | undefined>,
): string => {
  const lines: string[] = ['Available providers:', ''];
  for (const provider of PROVIDER_LIST) {
    const choice = formatProviderChoice(provider, env);
    lines.push(`  ${choice.display}`);
    lines.push(`    Use for : ${provider.bestUse}`);
    if (!choice.configured && provider.envVar) {
      lines.push(`    Setup   : ${provider.setupHint}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
};
