import {Box, Text} from 'ink';
import React from 'react';

import {normalizeStatusLabel} from './statusLine.js';
import {buildStatusBarViewModel} from './viewModels.js';
import type {AgentSessionRecord} from '../multisession/types.js';
import type {FileLock} from '../multisession/locks.js';

interface StatusBarProps {
  activeMode: string;
  activeTaskId?: string;
  activeTaskStatus?: string;
  agentLocks?: FileLock[];
  agentSessions?: AgentSessionRecord[];
  approvalMode: string;
  codeIntelligenceStatus?: string | null;
  cwd: string;
  gitBranch?: string | null;
  model: string;
  providerConfidence?: string | null;
  provider: string;
  repoMapStatus?: string | null;
  status: string;
  sessionId?: string;
  usageSummary?: string | null;
  verbose?: boolean;
}

const providerConfidenceColor = (value?: string | null): 'gray' | 'green' | 'red' | 'yellow' => {
  if (!value) {
    return 'gray';
  }

  if (value.startsWith('pass')) {
    return 'green';
  }

  if (value.startsWith('fail')) {
    return 'red';
  }

  return 'yellow';
};

export const StatusBar = ({
  activeMode,
  activeTaskId,
  activeTaskStatus,
  agentLocks,
  agentSessions,
  approvalMode,
  codeIntelligenceStatus,
  cwd,
  gitBranch,
  model,
  providerConfidence,
  provider,
  repoMapStatus,
  sessionId,
  status,
  usageSummary,
  verbose = false,
}: StatusBarProps) => {
  const viewModel = buildStatusBarViewModel({
    activeMode,
    activeTaskId,
    activeTaskStatus,
    agentLocks,
    agentSessions,
    approvalMode,
    codeIntelligenceStatus,
    cwd,
    gitBranch,
    model,
    providerConfidence,
    provider,
    repoMapStatus,
    sessionId,
    status,
    usageSummary,
  });
  const secondaryItems = [
    viewModel.modeLabel,
    viewModel.activeTaskLabel,
    viewModel.approvalLabel,
    viewModel.repoMapLabel,
    viewModel.codeIntelligenceLabel,
    viewModel.providerConfidenceLabel,
    viewModel.sessionCountLabel,
    viewModel.lockCountLabel,
    viewModel.usageLabel,
    viewModel.sessionLabel,
  ].filter((item): item is string => Boolean(item));

  const statusText = normalizeStatusLabel(viewModel.statusLabel);

  // Normal mode: one calm, compact status line. No border, no internal fields.
  if (!verbose) {
    return (
      <Box>
        <Text bold color="greenBright">ApeironCode</Text>
        <Text dimColor> · </Text>
        <Text>{viewModel.providerLabel}</Text>
        <Text dimColor> · </Text>
        <Text color="blue">{viewModel.workspaceLabel}</Text>
        {viewModel.gitBranch ? (
          <>
            <Text dimColor> · </Text>
            <Text color="green">{viewModel.gitBranch}</Text>
          </>
        ) : null}
        <Text dimColor> · </Text>
        <Text color="yellow">{statusText}</Text>
      </Box>
    );
  }

  // Debug/verbose mode: full bordered status with internal fields.
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="blue">{viewModel.workspaceLabel}</Text>
        <Text>{viewModel.providerLabel}</Text>
        {viewModel.gitBranch ? <Text color="green">{viewModel.gitBranch}</Text> : null}
        <Text color="yellow">{viewModel.statusLabel}</Text>
      </Box>
      <Box>
        <Text color={providerConfidenceColor(viewModel.providerConfidenceLabel)} wrap="truncate">
          {secondaryItems.join(' | ')}
        </Text>
      </Box>
    </Box>
  );
};
