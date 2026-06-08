import {Box, Text} from 'ink';
import React from 'react';

import {formatCost, formatTokens, summarizeUsageSnapshots} from '../providers/costTracker.js';
import type {DashboardSession} from './dashboardTypes.js';

interface CostSummaryPanelProps {
  label: string;
  sessions: DashboardSession[];
}

export const CostSummaryPanel = ({label, sessions}: CostSummaryPanelProps) => {
  const summary = summarizeUsageSnapshots(sessions.map((session) => session.tokenUsage));
  const sessionsWithUsage = sessions.filter((session) => Boolean(session.tokenUsage?.totalTokens)).length;

  return (
    <Box flexDirection="column">
      <Text color="cyan">Scope: {label}</Text>
      <Text dimColor>
        Sessions: {sessions.length} | With usage: {sessionsWithUsage}
      </Text>
      <Text>
        Tokens: {formatTokens(summary.totalInputTokens + summary.totalOutputTokens)} | Cost: {formatCost(summary.totalEstimatedCostUsd)}
      </Text>
      {summary.breakdown.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {summary.breakdown.slice(0, 5).map((entry) => (
            <Text key={`${entry.provider}:${entry.model}`}>
              {entry.provider}/{entry.model} | {entry.calls} call{entry.calls === 1 ? '' : 's'} | {formatTokens(entry.inputTokens + entry.outputTokens)} | {formatCost(entry.estimatedCostUsd)}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>No usage recorded yet.</Text>
      )}
    </Box>
  );
};

interface CostViewProps {
  label: string;
  sessions: DashboardSession[];
  title: string;
}

export const CostView = ({label, sessions, title}: CostViewProps) => {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">{title}</Text>
      <CostSummaryPanel label={label} sessions={sessions} />
    </Box>
  );
};