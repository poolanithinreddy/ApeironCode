import {Box, Text} from 'ink';
import React from 'react';

import type {EditHistoryRecord} from '../tools/patch/types.js';
import {CostSummaryPanel} from './CostView.js';
import type {DashboardSession} from './dashboardTypes.js';

interface HistoryViewerProps {
  costLabel: string;
  editLabel: string;
  edits: EditHistoryRecord[];
  includeProjectPath?: boolean;
  sessionLabel: string;
  sessions: DashboardSession[];
  title: string;
}

export const HistoryViewer = ({
  costLabel,
  editLabel,
  edits,
  includeProjectPath,
  sessionLabel,
  sessions,
  title,
}: HistoryViewerProps) => {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
      <Text color="green">{title}</Text>
      <Text color="cyan">Sessions: {sessionLabel}</Text>
      {sessions.length > 0 ? (
        <Box flexDirection="column">
          {sessions.slice(0, 6).map((session) => (
            <Text key={session.id}>
              {session.id} | {session.title} | {session.provider}/{session.model}
              {includeProjectPath ? ` | ${session.projectPath}` : ''} | {session.updatedAt}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>No sessions found.</Text>
      )}

      <Box marginTop={1} flexDirection="column">
        <CostSummaryPanel label={costLabel} sessions={sessions} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Edit history: {editLabel}</Text>
        {edits.length > 0 ? (
          edits.slice(0, 8).map((record) => (
            <Text key={record.id}>
              {record.id} | {record.operationType} | {record.filePath} | +{record.addedLines}/-{record.removedLines}
              {record.revertMethod ? ` | ${record.revertMethod}` : ''}
            </Text>
          ))
        ) : (
          <Text dimColor>No edit history found.</Text>
        )}
      </Box>
    </Box>
  );
};