import type {ConfigStore} from '../../config/config.js';
import type {SetupOptionId} from '../SetupWizard.js';

export const applySetupOption = async ({
  appendLocalAssistantMessage,
  configStore,
  option,
}: {
  appendLocalAssistantMessage: (content: unknown) => void;
  configStore: ConfigStore;
  option: SetupOptionId;
}): Promise<void> => {
  if (option === 'mock') {
    await configStore.patchUserConfig({
      approvalMode: 'ask',
      defaultModel: 'mock-coder',
      defaultProvider: 'mock',
      localOnly: true,
    });
    appendLocalAssistantMessage('Configured mock provider. You can try ApeironCode now without an API key.');
  } else if (option === 'ollama') {
    await configStore.patchUserConfig({
      defaultModel: 'qwen2.5-coder:7b',
      defaultProvider: 'ollama',
      localOnly: true,
    });

    try {
      const response = await fetch('http://localhost:11434/api/tags');
      appendLocalAssistantMessage(
        response.ok
          ? 'Configured Ollama. Local server is reachable at http://localhost:11434.'
          : 'Configured Ollama, but the local server did not respond successfully.',
      );
    } catch {
      appendLocalAssistantMessage(
        'Configured Ollama. Start Ollama locally and pull qwen2.5-coder if needed.',
      );
    }
  } else if (option === 'openrouter') {
    await configStore.patchUserConfig({
      defaultModel: 'qwen/qwen-2.5-coder-32b-instruct',
      defaultProvider: 'openrouter',
    });
    appendLocalAssistantMessage('Configured OpenRouter. Set OPENROUTER_API_KEY in your shell.');
  } else if (option === 'gemini') {
    await configStore.patchUserConfig({
      defaultModel: 'gemini-2.5-flash',
      defaultProvider: 'gemini',
    });
    appendLocalAssistantMessage('Configured Gemini. Set GEMINI_API_KEY in your shell.');
  } else if (option === 'openaiCompatible') {
    await configStore.patchUserConfig({
      defaultModel: 'gpt-4.1-mini',
      defaultProvider: 'openaiCompatible',
    });
    appendLocalAssistantMessage(
      'Configured an OpenAI-compatible profile. Set OPENAI_API_KEY and baseUrl if needed.',
    );
  } else {
    appendLocalAssistantMessage('Use apeironcode config set ... to configure a provider manually.');
  }
};
