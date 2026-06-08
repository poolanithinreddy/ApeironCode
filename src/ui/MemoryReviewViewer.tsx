import {Box, Text} from 'ink';
import React from 'react';

import type {MemorySuggestion} from '../memory/suggestions.js';
import {buildMemoryReviewViewModel} from './memoryReviewViewModel.js';

interface MemoryReviewViewerProps {
  suggestions: MemorySuggestion[];
}

export const MemoryReviewViewer = ({suggestions}: MemoryReviewViewerProps) => {
  const viewModel = buildMemoryReviewViewModel(suggestions);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">{viewModel.title}</Text>
      {viewModel.empty ? (
        <Text dimColor>No pending memory suggestions.</Text>
      ) : viewModel.items.map((item) => (
        <Box key={item.idLine} flexDirection="column" marginTop={1}>
          <Text>{item.idLine}</Text>
          <Text dimColor>{item.sourceLine}</Text>
          <Text>{item.summaryLine}</Text>
          <Text dimColor>{item.factsLine}</Text>
          {item.factPreviewLines.map((line) => <Text key={line} dimColor>{line}</Text>)}
          <Text dimColor>{item.relatedLine}</Text>
          <Text color={item.redactionLine.includes('applied') ? 'yellow' : 'green'}>{item.redactionLine}</Text>
          <Text color={item.warningLine.includes('redaction') ? 'yellow' : 'green'}>{item.warningLine}</Text>
          <Text dimColor>{item.hintLine}</Text>
        </Box>
      ))}
    </Box>
  );
};
