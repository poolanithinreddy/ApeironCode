import {createOpenAICompatibleProvider} from './openaiCompatible.js';

export const createOpenAIProvider = createOpenAICompatibleProvider({
  defaultModels: ['gpt-4.1-mini', 'gpt-4.1'],
  displayName: 'OpenAI',
  name: 'openai',
});