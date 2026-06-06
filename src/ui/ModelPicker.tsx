import {Box, Text} from 'ink';
import React from 'react';

interface ModelOption {
  configuredProvider?: boolean;
  displayName?: string;
  notes?: string;
  provider: string;
  model: string;
  priceTier?: 'cheap' | 'free' | 'paid';
  recommended?: boolean;
  local?: boolean;
  roles?: string[];
}

interface ModelPickerProps {
  models: ModelOption[];
}

export const ModelPicker = ({models}: ModelPickerProps) => {
  const localModels = models.filter((model) => model.local);
  const cloudModels = models.filter((model) => !model.local);

  const renderGroup = (title: string, entries: ModelOption[]) => {
    if (entries.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan">{title}</Text>
        {entries.map((model) => (
          <Box key={`${model.provider}/${model.model}`} flexDirection="column" marginBottom={1}>
            <Text>
              {model.displayName ?? model.model}
              {model.recommended ? ' ⭐' : ''}
              {model.priceTier ? ` [{model.priceTier}]` : ''}
            </Text>
            <Text dimColor>
              {model.provider} | {model.configuredProvider === false ? 'provider needs setup' : 'ready'}
              {model.roles?.length ? ` | roles=${model.roles.join(',')}` : ''}
            </Text>
            {model.notes ? <Text dimColor>{model.notes}</Text> : null}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold>Available models:</Text>
      {renderGroup('Local models', localModels)}
      {renderGroup('Cloud models', cloudModels)}
      <Text dimColor>Use /model [name] to change the default model</Text>
    </Box>
  );
};
