import {Box, Text} from 'ink';
import React, {useState} from 'react';

interface CommandDefinition {
  name: string;
  description: string;
  category?: string;
  status?: 'stable' | 'experimental' | 'requires-setup' | 'approval-gated' | 'local-only' | 'read-only';
  examples?: string[];
}

interface CommandPalettePanelProps {
  commands: CommandDefinition[];
  compact?: boolean;
}

const CATEGORIES = [
  'Start',
  'Session',
  'Agent',
  'Team',
  'Memory',
  'Skill',
  'GitHub',
  'Provider',
  'Setup',
  'Security',
  'Advanced',
];

export const CommandPalettePanel = ({
  commands,
  compact = false,
}: CommandPalettePanelProps) => {
  const [searchQuery] = useState('');
  const [selectedCategoryIndex] = useState(0);
  const [selectedCommandIndex] = useState(0);

  const filteredCommands = searchQuery.trim()
    ? commands.filter((cmd) =>
        cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : commands;

  const selectedCategory = CATEGORIES[selectedCategoryIndex];
  const commandsInCategory = selectedCategory
    ? filteredCommands.filter((cmd) => cmd.category === selectedCategory)
    : filteredCommands;

  const selectedCommand = commandsInCategory[selectedCommandIndex];

  if (compact) {
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1} paddingY={1}>
        <Text bold color="cyan">Command Palette (Beginner)</Text>
        <Text dimColor>Type to search | ↑↓ to navigate | Enter to run | Esc to close</Text>
        <Box flexDirection="column" marginTop={1}>
          {commandsInCategory.slice(0, 5).map((cmd, idx) => (
            <Box key={cmd.name} paddingX={1}>
              <Text color={idx === selectedCommandIndex ? 'green' : undefined}>
                {idx === selectedCommandIndex ? '❯ ' : '  '}
                {cmd.name}
              </Text>
              <Text dimColor>{cmd.description}</Text>
            </Box>
          ))}
          {commandsInCategory.length > 5 && (
            <Text dimColor>... {commandsInCategory.length - 5} more</Text>
          )}
        </Box>
        {selectedCommand && (
          <Box flexDirection="column" marginTop={1} paddingX={1}>
            <Text dimColor>Selected: {selectedCommand.name}</Text>
            {selectedCommand.examples && selectedCommand.examples.length > 0 && (
              <Text dimColor>Example: {selectedCommand.examples[0]}</Text>
            )}
          </Box>
        )}
      </Box>
    );
  }

  // Full command palette
  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1} paddingY={1}>
      <Box>
        <Text bold color="cyan">Command Palette</Text>
        <Text dimColor>{filteredCommands.length} command{filteredCommands.length === 1 ? '' : 's'}</Text>
      </Box>

      <Box marginBottom={1} marginTop={1}>
        <Text>Search: </Text>
        <Text>{searchQuery || '(type to filter)'}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Categories:</Text>
        <Box>
          {CATEGORIES.map((cat, idx) => (
            <Box key={cat} marginRight={2}>
              <Text color={idx === selectedCategoryIndex ? 'green' : undefined}>
                {idx === selectedCategoryIndex ? `[${cat}]` : cat}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Commands:</Text>
        {commandsInCategory.slice(0, 8).map((cmd, idx) => (
          <Box key={cmd.name} paddingX={1} paddingY={0}>
            <Text color={idx === selectedCommandIndex ? 'green' : undefined}>
              {idx === selectedCommandIndex ? '❯ ' : '  '}
              {cmd.name}
            </Text>
            {cmd.status && (
              <Text
                color={
                  cmd.status === 'stable' ? 'green'
                    : cmd.status === 'experimental' ? 'yellow'
                      : 'red'
                }
              >
                [{cmd.status}]
              </Text>
            )}
            <Text dimColor>{cmd.description}</Text>
          </Box>
        ))}
        {commandsInCategory.length > 8 && (
          <Text dimColor>... and {commandsInCategory.length - 8} more</Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {selectedCommand && (
          <>
            <Text bold>{selectedCommand.name}</Text>
            <Text dimColor>{selectedCommand.description}</Text>
            {selectedCommand.examples && selectedCommand.examples.length > 0 && (
              <>
                <Text dimColor>Examples:</Text>
                {selectedCommand.examples.map((example) => (
                  <Text key={example} dimColor>
                    {example}
                  </Text>
                ))}
              </>
            )}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate | ←→ categories | Enter run | Esc close | / search</Text>
      </Box>
    </Box>
  );
};
