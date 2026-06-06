import type {ApeironCodeConfig} from '../config/config.js';
import {resolveProviderApiKey} from '../config/secrets.js';
import {AppError} from '../utils/errors.js';
import {AnthropicProvider} from './anthropic.js';
import {AzureOpenAIProvider} from './azure.js';
import {BedrockProvider} from './bedrock.js';
import {createDeepSeekProvider} from './deepseek.js';
import {GeminiProvider} from './gemini.js';
import {createGitHubModelsProvider} from './githubModels.js';
import {createGroqProvider} from './groq.js';
import {MockProvider} from './mock.js';
import {OllamaProvider} from './ollama.js';
import {createOpenAIProvider} from './openai.js';
import {createOpenAICompatibleProvider, OpenAICompatibleProvider} from './openaiCompatible.js';
import {createOpenRouterProvider} from './openrouter.js';
import type {ModelProvider, ProviderFactory} from './types.js';

export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();

  constructor() {
    this.register('mock', () => new MockProvider());
    this.register('ollama', ({baseUrl}) => new OllamaProvider(baseUrl));
    this.register('openaiCompatible', createOpenAICompatibleProvider({
      defaultModels: ['gpt-4.1-mini'],
      displayName: 'OpenAI Compatible',
      name: 'openaiCompatible',
    }));
    this.register('github-models', createGitHubModelsProvider);
    this.register('openrouter', createOpenRouterProvider);
    this.register('groq', createGroqProvider);
    this.register('deepseek', createDeepSeekProvider);
    this.register('openai', createOpenAIProvider);
    this.register('gemini', ({apiKey, baseUrl}) => new GeminiProvider(baseUrl, apiKey));
    this.register('anthropic', ({apiKey, baseUrl}) => new AnthropicProvider(baseUrl, apiKey));
    this.register('bedrock', () => new BedrockProvider());
    this.register('azure', () => new AzureOpenAIProvider());
  }

  register(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  listProviderNames(): string[] {
    return Array.from(this.factories.keys()).sort();
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  create(name: string, config: ApeironCodeConfig): ModelProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new AppError(`Unknown provider: ${name}`, 'PROVIDER_NOT_FOUND');
    }

    const baseUrl = config.baseUrls[name] ?? config.baseUrls.openaiCompatible ?? '';
    const apiKey = resolveProviderApiKey(name, config);
    return factory({apiKey, baseUrl});
  }

  createActive(config: ApeironCodeConfig): ModelProvider {
    return this.create(config.defaultProvider, config);
  }
}

export const providerRegistry = new ProviderRegistry();

export const isOpenAICompatibleProvider = (
  provider: ModelProvider,
): provider is OpenAICompatibleProvider => {
  return provider instanceof OpenAICompatibleProvider;
};