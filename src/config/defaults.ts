import type {ApprovalMode, ApeironCodeConfig} from './config.js';

export const DEFAULT_PROVIDER = 'ollama';
export const DEFAULT_MODEL = 'qwen2.5-coder:7b';

export const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  azure: 'https://apeironcode.openai.azure.com/',
  bedrock: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  deepseek: 'https://api.deepseek.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'github-models': 'https://models.github.ai/inference',
  groq: 'https://api.groq.com/openai/v1',
  mock: 'mock://local',
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com/v1',
  openaiCompatible: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export const DEFAULT_API_KEY_ENV_NAMES: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
  bedrock: 'AWS_ACCESS_KEY_ID',
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  'github-models': 'GITHUB_TOKEN',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  openaiCompatible: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export const DEFAULT_IGNORED_PATHS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.venv',
  'target',
  'vendor',
  '*.lock',
];

export const DEFAULT_APPROVAL_MODE: ApprovalMode = 'ask';

export const DEFAULT_CONFIG: ApeironCodeConfig = {
  apiKeyEnvNames: DEFAULT_API_KEY_ENV_NAMES,
  approvalMode: DEFAULT_APPROVAL_MODE,
  baseUrls: DEFAULT_BASE_URLS,
  defaultModel: DEFAULT_MODEL,
  defaultProvider: DEFAULT_PROVIDER,
  fallbackModel: undefined,
  ignoredPaths: DEFAULT_IGNORED_PATHS,
  localOnly: false,
  maxContextFiles: 20,
  maxFixAttempts: 3,
  maxFileSize: 200_000,
  maxIterations: 40,
  lsp: {
    enabled: true,
    fallbackOnFailure: true,
    idleTimeoutMs: 300_000,
    longLivedSessions: true,
    maxSessions: 5,
    requestTimeoutMs: 3_000,
  },
  memory: {
    autoSave: false,
    autoSuggest: true,
  },
  mcp: {
    servers: {},
  },
  models: {},
  permissions: [],
  sandbox: {
    fallbackPolicy: 'safe-readonly',
  },
  planning: {
    autoPlanForLargeTasks: true,
    largeTaskThreshold: 3,
    requireApproval: true,
    requireBeforeEdit: false,
  },
  plugins: {
    directories: [],
    disabled: [],
  },
  web: {
    allowPrivateHosts: false,
    enabled: true,
    maxFetchChars: 6_000,
    maxSearchResults: 5,
    searchProvider: 'duckduckgo',
    userAgent: 'ApeironCode-Agent/0.1',
  },
  telemetry: false,
  ui: {
    compact: false,
    showTips: true,
    showWhatsNew: true,
    theme: 'auto',
    welcome: true,
  },
  theme: 'auto',
  tokenEfficiency: {
    context: {
      maxFullFiles: 4,
      maxSummaryFiles: 8,
    },
    enabled: true,
    memory: {
      maxMemoryTokens: 800,
    },
    reasoningStyle: {
      default: 'balanced',
    },
    tools: {
      dynamicExposureEnabled: true,
      maxToolOutputTokens: 1_200,
    },
  },
};
