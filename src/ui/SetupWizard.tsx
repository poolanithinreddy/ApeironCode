import {Box, Text, useInput} from 'ink';
import React, {useState} from 'react';

export type SetupOptionId =
  | 'mock'
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'openaiCompatible'
  | 'other';

interface SetupWizardProps {
  onSelect: (option: SetupOptionId) => void | Promise<void>;
}

const OPTIONS: Array<{id: SetupOptionId; label: string; description: string}> = [
  {
    description: 'Try ApeironCode immediately with deterministic local responses. No API key required.',
    id: 'mock',
    label: 'Try without API key',
  },
  {
    description: 'Use a local Ollama server and qwen2.5-coder.',
    id: 'ollama',
    label: 'Ollama local',
  },
  {
    description: 'Use OpenRouter with an OPENROUTER_API_KEY environment variable.',
    id: 'openrouter',
    label: 'OpenRouter',
  },
  {
    description: 'Use Gemini with a GEMINI_API_KEY environment variable.',
    id: 'gemini',
    label: 'Gemini',
  },
  {
    description: 'Use any OpenAI-compatible endpoint with an API key env var.',
    id: 'openaiCompatible',
    label: 'OpenAI-compatible',
  },
  {
    description: 'Set provider values manually later with apeironcode config set ...',
    id: 'other',
    label: 'Other',
  },
];

export const SetupWizard = ({onSelect}: SetupWizardProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((current) => (current === 0 ? OPTIONS.length - 1 : current - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => (current === OPTIONS.length - 1 ? 0 : current + 1));
      return;
    }

    if (key.return) {
      void onSelect(OPTIONS[selectedIndex]?.id ?? 'other');
      return;
    }

    const numericIndex = Number.parseInt(input, 10);
    if (!Number.isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= OPTIONS.length) {
      void onSelect(OPTIONS[numericIndex - 1]?.id ?? 'other');
    }
  });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="green" paddingX={1}>
      <Text color="green">First-run setup</Text>
      <Text>Choose a provider profile to configure this machine.</Text>
      {OPTIONS.map((option, index) => (
        <Box key={option.id} marginTop={1}>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {index + 1}. {option.label} - {option.description}
          </Text>
        </Box>
      ))}
      <Text dimColor>Use ↑/↓ or number keys, then press Enter.</Text>
    </Box>
  );
};
