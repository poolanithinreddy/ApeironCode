import {Box, Text} from 'ink';
import React from 'react';

import type {TaskPlan} from '../tasks/types.js';
import type {DashboardSession} from './dashboardTypes.js';
import {buildHomeDashboardViewModel} from './viewModels.js';
import type {AgentSessionRecord} from '../multisession/types.js';
import type {FileLock} from '../multisession/locks.js';

interface HomeDashboardProps {
  activeTask?: TaskPlan | null;
  agentLocks?: FileLock[];
  agentSessions?: AgentSessionRecord[];
  approvalMode?: string;
  codeIntelligenceLine: string;
  gitBranch?: string | null;
  historyHint?: string;
  localOnly?: boolean;
  memorySuggestionCount?: number;
  memorySuggestionSummary?: string;
  modeLabel: string;
  model: string;
  projectSummary: string;
  provider: string;
  providerConfidence?: string | null;
  recentSessions: DashboardSession[];
  setupNeeded?: boolean;
  shortcuts: Array<{command: string; description: string}>;
  teamRunCount?: number;
  title: string;
  compact?: boolean;
  workspacePath: string;
}

export const HomeDashboard = ({
  activeTask,
  agentLocks,
  agentSessions,
  approvalMode,
  codeIntelligenceLine,
  compact,
  gitBranch,
  historyHint,
  localOnly,
  memorySuggestionCount,
  memorySuggestionSummary,
  modeLabel,
  model,
  projectSummary,
  provider,
  providerConfidence,
  recentSessions,
  setupNeeded,
  shortcuts,
  teamRunCount,
  title,
  workspacePath,
}: HomeDashboardProps) => {
  const viewModel = buildHomeDashboardViewModel({
    activeTask,
    agentLocks,
    agentSessions,
    approvalMode,
    codeIntelligenceLine,
    gitBranch,
    historyHint,
    localOnly,
    memorySuggestionCount,
    memorySuggestionSummary,
    modeLabel,
    model,
    projectSummary,
    provider,
    providerConfidence,
    recentSessions,
    setupNeeded,
    shortcuts,
    teamRunCount,
    title,
    workspacePath,
  });

  if (setupNeeded) {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow">ApeironCode — Setup Required</Text>
        <Text dimColor>{viewModel.projectPathLine}</Text>
        <Text> </Text>
        <Text color="white">No AI provider configured. Type a command to get started:</Text>
        <Text> </Text>
        <Text color="green">  /setup</Text>
        <Text dimColor>          Configure a provider (Anthropic, OpenAI, Ollama, etc.)</Text>
        <Text color="green">  /doctor</Text>
        <Text dimColor>          Diagnose your environment</Text>
        <Text color="green">  /commands beginner</Text>
        <Text dimColor>          See beginner-friendly commands</Text>
        <Text> </Text>
        <Text dimColor>Tip: run /setup to connect an AI provider, then start chatting.</Text>
      </Box>
    );
  }

  if (compact) {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">{viewModel.title}</Text>
        <Text dimColor>{viewModel.projectPathLine}</Text>
        <Text>{viewModel.headerLine}</Text>
        <Box marginTop={1} flexDirection="column">
          {viewModel.shortcutLines.slice(0, 3).map((shortcutLine, index) => (
            <Text key={`${shortcutLine}:${index}`}>{shortcutLine}</Text>
          ))}
        </Box>
        <Text dimColor>Use /setup to change provider.</Text>
        <Text dimColor>Type a prompt to start, or /dashboard for the full workspace view.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{viewModel.title}</Text>
      <Text dimColor>{viewModel.projectPathLine}</Text>
      <Text>{viewModel.headerLine}</Text>
      <Text>{viewModel.projectSummary}</Text>

      <Box marginTop={1} flexDirection="column">
        <Text color="green">Start Here</Text>
        {viewModel.shortcutLines.slice(0, 5).map((shortcutLine, index) => (
          <Text key={`${shortcutLine}:${index}`}>
            {shortcutLine}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="green">Readiness</Text>
        {viewModel.agentReadyLines.map((line) => <Text key={line}>{line}</Text>)}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="green">Project</Text>
        {viewModel.projectStateLines.map((line) => <Text key={line}>{line}</Text>)}
        <Text dimColor>{viewModel.codeIntelligenceLine}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="blue">Work</Text>
        {viewModel.workLines.map((line) => <Text key={line}>{line}</Text>)}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="magenta">Review</Text>
        {viewModel.reviewLines.map((line) => <Text key={line}>{line}</Text>)}
        <Text dimColor={!activeTask}>{viewModel.activeTaskLine}</Text>
      </Box>

      {viewModel.lockCountLine && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">{viewModel.lockCountLine}</Text>
        </Box>
      )}

      {viewModel.memorySuggestionLine && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">{viewModel.memorySuggestionLine}</Text>
          {viewModel.memorySuggestionSummaryLine && <Text>{viewModel.memorySuggestionSummaryLine}</Text>}
          <Text dimColor>Use /memory suggestions to review.</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="blue">Integrations</Text>
        {viewModel.integrationLines.map((line) => <Text key={line}>{line}</Text>)}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="red">Safety</Text>
        {viewModel.safetyLines.map((line) => <Text key={line} dimColor>{line}</Text>)}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Help</Text>
        {viewModel.helpLines.map((line) => <Text key={line}>{line}</Text>)}
        <Text dimColor>{viewModel.historyHint}</Text>
      </Box>
    </Box>
  );
};
