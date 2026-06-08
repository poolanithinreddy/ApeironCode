export type ModelRole = 'cheap' | 'coding' | 'fast' | 'local' | 'reasoning';

export interface ProviderCapabilities {
  contextWindow?: number;
  jsonMode: boolean;
  local: boolean;
  nativeToolCalling: boolean;
  streaming: boolean;
  vision: boolean;
}

export interface ModelCatalogEntry {
  capabilities: ProviderCapabilities;
  contextWindow?: number;
  displayName: string;
  inputCostPer1kTokens?: number;
  model: string;
  notes?: string;
  outputCostPer1kTokens?: number;
  providerName: string;
  roles: ModelRole[];
}

export type ModelPriceTier = 'cheap' | 'free' | 'paid';

const DEFAULT_CAPABILITIES: Record<string, ProviderCapabilities> = {
  anthropic: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: true},
  azure: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: true},
  bedrock: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: false},
  deepseek: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: false},
  gemini: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: true},
  groq: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: false},
  mock: {jsonMode: true, local: true, nativeToolCalling: false, streaming: true, vision: false},
  ollama: {jsonMode: false, local: true, nativeToolCalling: false, streaming: true, vision: false},
  openai: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: true},
  openaiCompatible: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: false},
  openrouter: {jsonMode: true, local: false, nativeToolCalling: true, streaming: true, vision: true},
};

const withContextWindow = (
  capabilities: ProviderCapabilities,
  contextWindow: number,
): ProviderCapabilities => ({
  contextWindow,
  jsonMode: capabilities.jsonMode,
  local: capabilities.local,
  nativeToolCalling: capabilities.nativeToolCalling,
  streaming: capabilities.streaming,
  vision: capabilities.vision,
});

const getDefaultCapabilities = (
  providerName: keyof typeof DEFAULT_CAPABILITIES,
): ProviderCapabilities => DEFAULT_CAPABILITIES[providerName]!;

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    capabilities: withContextWindow(getDefaultCapabilities('ollama'), 32_000),
    contextWindow: 32_000,
    displayName: 'Qwen 2.5 Coder 7B',
    model: 'qwen2.5-coder:7b',
    notes: 'Strong local-first default for coding on Ollama.',
    providerName: 'ollama',
    roles: ['local', 'coding'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('ollama'), 128_000),
    contextWindow: 128_000,
    displayName: 'Llama 3.1 8B',
    model: 'llama3.1:8b',
    notes: 'General local fallback when you want broad availability on Ollama.',
    providerName: 'ollama',
    roles: ['local', 'cheap', 'fast'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('openrouter'), 128_000),
    contextWindow: 128_000,
    displayName: 'Qwen 2.5 Coder 32B Instruct',
    inputCostPer1kTokens: 0.0008,
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    notes: 'Balanced cloud coding model with large context.',
    outputCostPer1kTokens: 0.0024,
    providerName: 'openrouter',
    roles: ['coding'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('deepseek'), 64_000),
    contextWindow: 64_000,
    displayName: 'DeepSeek Chat',
    inputCostPer1kTokens: 0.00027,
    model: 'deepseek-chat',
    notes: 'Low-cost cloud default for general coding and chat.',
    outputCostPer1kTokens: 0.0011,
    providerName: 'deepseek',
    roles: ['cheap', 'coding'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('groq'), 131_072),
    contextWindow: 131_072,
    displayName: 'Llama 3.1 8B Instant',
    inputCostPer1kTokens: 0.00005,
    model: 'llama-3.1-8b-instant',
    notes: 'Fast, cheap model for simple routing and summarization.',
    outputCostPer1kTokens: 0.00008,
    providerName: 'groq',
    roles: ['fast', 'cheap'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('gemini'), 1_000_000),
    contextWindow: 1_000_000,
    displayName: 'Gemini 2.0 Flash',
    inputCostPer1kTokens: 0.0001,
    model: 'gemini-2.0-flash',
    notes: 'Very large context window for repo-wide summarization and analysis.',
    outputCostPer1kTokens: 0.0004,
    providerName: 'gemini',
    roles: ['fast', 'cheap', 'reasoning'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('openai'), 128_000),
    contextWindow: 128_000,
    displayName: 'o3-mini',
    inputCostPer1kTokens: 0.0011,
    model: 'o3-mini',
    notes: 'Reasoning-oriented model for difficult debugging and planning.',
    outputCostPer1kTokens: 0.0044,
    providerName: 'openai',
    roles: ['reasoning'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('openai'), 128_000),
    contextWindow: 128_000,
    displayName: 'GPT-4.1 Mini',
    inputCostPer1kTokens: 0.0004,
    model: 'gpt-4.1-mini',
    notes: 'Balanced OpenAI default for fast coding and review work.',
    outputCostPer1kTokens: 0.0016,
    providerName: 'openai',
    roles: ['coding', 'fast'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('anthropic'), 200_000),
    contextWindow: 200_000,
    displayName: 'Claude 3.5 Sonnet',
    inputCostPer1kTokens: 0.003,
    model: 'claude-3-5-sonnet-latest',
    notes: 'Strong long-context reviewer when Anthropic is already configured.',
    outputCostPer1kTokens: 0.015,
    providerName: 'anthropic',
    roles: ['reasoning', 'coding'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('mock'), 32_000),
    contextWindow: 32_000,
    displayName: 'Mock Coder',
    inputCostPer1kTokens: 0,
    model: 'mock-coder',
    notes: 'Deterministic development and CI model.',
    outputCostPer1kTokens: 0,
    providerName: 'mock',
    roles: ['cheap', 'fast', 'local'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('bedrock'), 200_000),
    contextWindow: 200_000,
    displayName: 'Claude 3.5 Sonnet (Bedrock)',
    inputCostPer1kTokens: 0.003,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    notes: 'High capability Claude model via AWS Bedrock.',
    outputCostPer1kTokens: 0.015,
    providerName: 'bedrock',
    roles: ['coding', 'reasoning'],
  },
  {
    capabilities: withContextWindow(getDefaultCapabilities('azure'), 128_000),
    contextWindow: 128_000,
    displayName: 'GPT-4 Turbo (Azure)',
    inputCostPer1kTokens: 0.01,
    model: 'gpt-4-turbo',
    notes: 'Deployment name in Azure, not OpenAI model name.',
    outputCostPer1kTokens: 0.03,
    providerName: 'azure',
    roles: ['reasoning', 'coding'],
  },
];

export const findCatalogEntry = (
  providerName: string,
  model: string,
): ModelCatalogEntry | null => {
  return MODEL_CATALOG.find(
    (entry) => entry.providerName === providerName && entry.model === model,
  ) ?? null;
};

export const listCatalogEntries = (role?: ModelRole): ModelCatalogEntry[] => {
  return role
    ? MODEL_CATALOG.filter((entry) => entry.roles.includes(role))
    : [...MODEL_CATALOG];
};

export const getModelPriceTier = (entry: ModelCatalogEntry): ModelPriceTier => {
  const totalCost = (entry.inputCostPer1kTokens ?? 0) + (entry.outputCostPer1kTokens ?? 0);
  if (totalCost === 0) {
    return 'free';
  }

  return totalCost <= 0.001 ? 'cheap' : 'paid';
};

export const getProviderCapabilities = (
  providerName: string,
  model: string,
): ProviderCapabilities => {
  return findCatalogEntry(providerName, model)?.capabilities
    ?? DEFAULT_CAPABILITIES[providerName]
    ?? {jsonMode: false, local: false, nativeToolCalling: false, streaming: true, vision: false};
};

export const formatProviderCapabilities = (capabilities: ProviderCapabilities): string => {
  return [
    capabilities.local ? 'local' : 'cloud',
    capabilities.streaming ? 'streaming' : 'buffered',
    capabilities.jsonMode ? 'json' : 'plain-text',
    capabilities.nativeToolCalling ? 'native-tools' : 'prompt-tools',
    capabilities.vision ? 'vision' : null,
    capabilities.contextWindow ? `ctx=${Math.round(capabilities.contextWindow / 1000)}k` : null,
  ]
    .filter(Boolean)
    .join(',');
};