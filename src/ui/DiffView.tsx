import {Box, Text} from 'ink';
import React from 'react';

interface DiffViewProps {
  diff: string;
}

export const DiffView = ({diff}: DiffViewProps) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {diff.split('\n').map((line, index) => {
        let color: 'green' | 'red' | 'cyan' | 'white' = 'white';

        if (line.startsWith('+') && !line.startsWith('+++')) {
          color = 'green';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          color = 'red';
        } else if (line.startsWith('@@')) {
          color = 'cyan';
        }

        return (
          <Text key={`${index}-${line}`} color={color}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
};