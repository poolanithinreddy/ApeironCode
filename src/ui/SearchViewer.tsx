import {Box, Text} from 'ink';
import React from 'react';

import type {SearchResult} from '../history/searchIndex.js';

interface SearchViewerProps {
  query: string;
  results: SearchResult[];
  title: string;
}

export const SearchViewer = ({query, results, title}: SearchViewerProps) => {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="blue" paddingX={1}>
      <Text color="blue">{title}</Text>
      <Text color="cyan">Query: {query}</Text>
      {results.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {results.slice(0, 8).map((result) => (
            <Box key={`${result.kind}:${result.id}`} flexDirection="column" marginBottom={1}>
              <Text>
                [{result.kind}] {result.title}
                {result.updatedAt ? ` | ${result.updatedAt}` : ''}
              </Text>
              <Text dimColor>{result.snippet}</Text>
              <Text color="gray">Action: {result.actionHint}</Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Text dimColor>No results found.</Text>
      )}
    </Box>
  );
};