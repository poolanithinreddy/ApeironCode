import {Box, Text} from 'ink';
import React from 'react';

export interface SessionInfo {
  id: string;
  title: string;
  projectPath: string;
  provider: string;
  model: string;
  updatedAt: string;
}

interface SessionPickerProps {
  sessions: SessionInfo[];
}

export const SessionPicker = ({sessions}: SessionPickerProps) => {
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No sessions found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold>Available sessions:</Text>
      {sessions.map((session) => (
        <Box key={session.id} flexDirection="column">
          <Text>{session.title}</Text>
          <Text dimColor>
            {session.provider}/{session.model} • {session.projectPath} • {new Date(session.updatedAt).toLocaleDateString()}
          </Text>
        </Box>
      ))}
      <Text dimColor>Use /resume [session-id] to resume a session</Text>
    </Box>
  );
};
