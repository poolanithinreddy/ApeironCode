import {createOpenAICompatibleProvider} from './openaiCompatible.js';

export const createDeepSeekProvider = createOpenAICompatibleProvider({
  defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  displayName: 'DeepSeek',
  name: 'deepseek',
});