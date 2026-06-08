import {Box, Text} from 'ink';
import React from 'react';

import {buildErrorPanelViewModel} from './viewModels.js';

export interface ErrorPanelProps {
  title: unknown;
  message: unknown;
  details?: unknown;
  type: 'permission' | 'tool-failure' | 'provider-error' | 'mcp-error' | 'plugin-error' | 'config-error';
}

export const ErrorPanel = ({title, message, details, type}: ErrorPanelProps) => {
  const viewModel = buildErrorPanelViewModel({details, message, title, type});

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={viewModel.color} paddingX={1}>
      <Text color={viewModel.color}>
        {viewModel.icon} {viewModel.title}
      </Text>
      <Text>{viewModel.message}</Text>
      {viewModel.details && <Text dimColor>{viewModel.details}</Text>}
    </Box>
  );
};
