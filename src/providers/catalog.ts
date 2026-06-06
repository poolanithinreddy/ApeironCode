export type ProviderKind = 'local' | 'api' | 'openai-compatible' | 'mock';
export type ProviderAuthType = 'none' | 'env' | 'base-url-env' | 'manual';
export type ProviderStatus = 'stable' | 'experimental' | 'planned';

export interface ProviderAuthConfig {
  type: ProviderAuthType;
  envVars?: string[];
  setupHint?: string;
}

export interface ProviderCapabilitiesConfig {
  streaming: boolean;
  nativeToolCalling: boolean;
  jsonMode: boolean;
  vision: boolean;
  embeddings: boolean;
  local: boolean;
  costKnown: boolean;
}

export interface RecommendedModel {
  id: string;
  label: string;
  roles: Array<'fast' | 'coding' | 'reasoning' | 'cheap' | 'local'>;
  contextWindow?: number;
  notes?: string;
}

export interface ProviderCatalogEntry {
  id: string;
  displayName: string;
  kind: ProviderKind;
  auth: ProviderAuthConfig;
  capabilities: ProviderCapabilitiesConfig;
  recommendedModels: RecommendedModel[];
  docsUrl?: string;
  status: ProviderStatus;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'mock',
    displayName: 'Mock Provider',
    kind: 'mock',
    auth: {type: 'none'},
    capabilities: {
      streaming: true,
      nativeToolCalling: false,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: true,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'mock-coder',
        label: 'Mock Coder',
        roles: ['coding', 'local'],
        notes: 'Deterministic mock for testing and CI',
      },
    ],
    status: 'stable',
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    kind: 'local',
    auth: {
      type: 'base-url-env',
      envVars: ['OLLAMA_BASE_URL'],
      setupHint: 'Run `ollama serve` then set OLLAMA_BASE_URL or use default http://localhost:11434',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: false,
      jsonMode: false,
      vision: false,
      embeddings: true,
      local: true,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'qwen2.5-coder:7b',
        label: 'Qwen 2.5 Coder 7B',
        roles: ['coding', 'local'],
        contextWindow: 32000,
        notes: 'Strong local-first default for coding',
      },
      {
        id: 'llama3.1:8b',
        label: 'Llama 3.1 8B',
        roles: ['local', 'cheap', 'fast'],
        contextWindow: 128000,
        notes: 'General local fallback',
      },
    ],
    docsUrl: 'https://ollama.ai',
    status: 'stable',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['OPENAI_API_KEY'],
      setupHint: 'Export OPENAI_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: true,
      embeddings: true,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'gpt-4o',
        label: 'GPT-4 Omni',
        roles: ['reasoning', 'coding'],
        contextWindow: 128000,
        notes: 'High capability flagship model',
      },
      {
        id: 'gpt-4-turbo',
        label: 'GPT-4 Turbo',
        roles: ['reasoning', 'coding'],
        contextWindow: 128000,
      },
    ],
    docsUrl: 'https://openai.com/api',
    status: 'stable',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['ANTHROPIC_API_KEY'],
      setupHint: 'Export ANTHROPIC_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: true,
      embeddings: false,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'claude-opus-4-1',
        label: 'Claude Opus 4.1',
        roles: ['reasoning', 'coding'],
        contextWindow: 200000,
        notes: 'High capability flagship model',
      },
      {
        id: 'claude-sonnet-4-20250514',
        label: 'Claude Sonnet 4',
        roles: ['coding', 'fast'],
        contextWindow: 200000,
      },
    ],
    docsUrl: 'https://www.anthropic.com/api',
    status: 'stable',
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    kind: 'openai-compatible',
    auth: {
      type: 'env',
      envVars: ['OPENROUTER_API_KEY'],
      setupHint: 'Export OPENROUTER_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: true,
      embeddings: false,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'qwen/qwen-2.5-coder-32b-instruct',
        label: 'Qwen 2.5 Coder 32B',
        roles: ['coding'],
        contextWindow: 128000,
        notes: 'Strong cloud coding model',
      },
    ],
    docsUrl: 'https://openrouter.ai',
    status: 'stable',
  },
  {
    id: 'groq',
    displayName: 'Groq',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['GROQ_API_KEY'],
      setupHint: 'Export GROQ_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'llama-3.1-70b-versatile',
        label: 'Llama 3.1 70B',
        roles: ['coding', 'reasoning', 'fast'],
        contextWindow: 131072,
        notes: 'Fast cloud inference',
      },
    ],
    docsUrl: 'https://groq.com',
    status: 'stable',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['DEEPSEEK_API_KEY'],
      setupHint: 'Export DEEPSEEK_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'deepseek-chat',
        label: 'DeepSeek Chat',
        roles: ['coding', 'cheap'],
        contextWindow: 64000,
        notes: 'Low-cost cloud coding',
      },
    ],
    docsUrl: 'https://deepseek.com',
    status: 'stable',
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['GEMINI_API_KEY'],
      setupHint: 'Export GEMINI_API_KEY environment variable',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: true,
      embeddings: true,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        roles: ['coding', 'fast'],
        contextWindow: 1000000,
        notes: 'Fast inference with large context',
      },
    ],
    docsUrl: 'https://ai.google.dev',
    status: 'stable',
  },
  {
    id: 'github-models',
    displayName: 'GitHub Models',
    kind: 'openai-compatible',
    auth: {
      type: 'env',
      envVars: ['GITHUB_TOKEN'],
      setupHint: 'Export GITHUB_TOKEN (a GitHub personal access token) — free GitHub-hosted inference',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: false,
      costKnown: false,
    },
    recommendedModels: [
      {
        id: 'openai/gpt-4.1',
        label: 'GPT-4.1',
        roles: ['reasoning', 'coding'],
        contextWindow: 128000,
        notes: 'Default GitHub Models flagship',
      },
      {
        id: 'openai/gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
        roles: ['coding', 'fast', 'cheap'],
        contextWindow: 128000,
      },
      {
        id: 'meta/llama-3.1-405b-instruct',
        label: 'Llama 3.1 405B',
        roles: ['reasoning', 'coding'],
        contextWindow: 128000,
      },
    ],
    docsUrl: 'https://github.com/marketplace/models',
    status: 'stable',
  },
  {
    id: 'openaiCompatible',
    displayName: 'OpenAI Compatible',
    kind: 'openai-compatible',
    auth: {
      type: 'manual',
      envVars: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY'],
      setupHint: 'Set base URL and API key for OpenAI-compatible server (e.g., vLLM, Text Generation WebUI)',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: false,
      costKnown: false,
    },
    recommendedModels: [],
    status: 'experimental',
  },
  {
    id: 'bedrock',
    displayName: 'AWS Bedrock',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
      setupHint: 'Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: false,
      embeddings: false,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        label: 'Claude 3.5 Sonnet',
        roles: ['coding', 'reasoning'],
        contextWindow: 200000,
        notes: 'High capability model for Bedrock',
      },
      {
        id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
        label: 'Claude 3.5 Haiku',
        roles: ['fast', 'cheap'],
        contextWindow: 200000,
        notes: 'Fast, cost-effective model',
      },
    ],
    docsUrl: 'https://aws.amazon.com/bedrock',
    status: 'stable',
  },
  {
    id: 'azure',
    displayName: 'Azure OpenAI',
    kind: 'api',
    auth: {
      type: 'env',
      envVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'],
      setupHint: 'Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT environment variables',
    },
    capabilities: {
      streaming: true,
      nativeToolCalling: true,
      jsonMode: true,
      vision: true,
      embeddings: true,
      local: false,
      costKnown: true,
    },
    recommendedModels: [
      {
        id: 'gpt-4-turbo',
        label: 'GPT-4 Turbo',
        roles: ['reasoning', 'coding'],
        contextWindow: 128000,
        notes: 'Deployment name in Azure, not OpenAI model name',
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4 Omni',
        roles: ['coding', 'fast'],
        contextWindow: 128000,
        notes: 'Latest model via Azure',
      },
    ],
    docsUrl: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
    status: 'stable',
  },
];

export const getProviderCatalogEntry = (providerId: string): ProviderCatalogEntry | undefined => {
  return PROVIDER_CATALOG.find((entry) => entry.id === providerId);
};

export const listProviderCatalogEntries = (): ProviderCatalogEntry[] => {
  return PROVIDER_CATALOG;
};

export const getStableProviders = (): ProviderCatalogEntry[] => {
  return PROVIDER_CATALOG.filter((entry) => entry.status === 'stable');
};

export const getLocalOnlyProviders = (): ProviderCatalogEntry[] => {
  return PROVIDER_CATALOG.filter((entry) => entry.capabilities.local);
};

export const getProvidersForRole = (role: 'fast' | 'coding' | 'reasoning' | 'cheap' | 'local'): ProviderCatalogEntry[] => {
  return PROVIDER_CATALOG.filter((provider) =>
    provider.recommendedModels.some((model) => model.roles.includes(role)),
  );
};
