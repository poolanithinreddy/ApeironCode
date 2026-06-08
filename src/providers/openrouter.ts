import {createOpenAICompatibleProvider} from './openaiCompatible.js';

export const createOpenRouterProvider = createOpenAICompatibleProvider({
  defaultModels: ['qwen/qwen-2.5-coder-32b-instruct', 'deepseek/deepseek-chat-v3-0324'],
  displayName: 'OpenRouter',
  extraHeaders: {
    'HTTP-Referer': 'https://github.com',
    'X-Title': 'ApeironCode',
  },
  name: 'openrouter',
});