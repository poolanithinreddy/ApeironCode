import {createOpenAICompatibleProvider} from './openaiCompatible.js';

export const GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference';
export const GITHUB_MODELS_DEFAULT_MODEL = 'openai/gpt-4.1';
export const GITHUB_MODELS_ENV_VAR = 'GITHUB_TOKEN';

export const GITHUB_MODELS_SUGGESTED_MODELS = [
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'meta/llama-3.1-405b-instruct',
];

// GitHub Models inference is reached through the OpenAI-compatible surface,
// but the GitHub API gateway requires the versioned API header and a bearer
// token. This mirrors the verified working request:
//   POST https://models.github.ai/inference/chat/completions
//   Authorization: Bearer $GITHUB_TOKEN
//   X-GitHub-Api-Version: 2022-11-28
export const createGitHubModelsProvider = createOpenAICompatibleProvider({
  defaultModels: GITHUB_MODELS_SUGGESTED_MODELS,
  displayName: 'GitHub Models',
  name: 'github-models',
  requiresApiKey: true,
  missingApiKeyEnvVar: GITHUB_MODELS_ENV_VAR,
  requestProfile: 'github-models',
  extraHeaders: {
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: 'application/vnd.github+json',
  },
});
