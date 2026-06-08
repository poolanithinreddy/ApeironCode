import {createOpenAICompatibleProvider} from './openaiCompatible.js';

export const createGroqProvider = createOpenAICompatibleProvider({
  defaultModels: ['llama-3.3-70b-versatile', 'qwen-qwq-32b'],
  displayName: 'Groq',
  name: 'groq',
});