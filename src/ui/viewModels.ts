import path from 'node:path';

import type {TaskPlan} from '../tasks/types.js';
import {formatPromptText} from '../utils/display.js';
import type {DashboardSession} from './dashboardTypes.js';
import type {ErrorPanelProps} from './ErrorPanel.js';
import type {AgentSessionRecord} from '../multisession/types.js';
import type {FileLock} from '../multisession/locks.js';

const compactLine = (value: string, max = 120): string => {
  const firstLine = value.replace(/\s+/gu, ' ').trim();
  return firstLine.length > max ? `${firstLine.slice(0, max - 3)}...` : firstLine;
};

export interface HomeDashboardViewModel {
  activeTaskLine: string;
  agentReadyLines: string[];
  codeIntelligenceLine: string;
  helpLines: string[];
  headerLine: string;
  historyHint: string;
  integrationLines: string[];
  projectPathLine: string;
  projectStateLines: string[];
  projectSummary: string;
  recentSessionLines: string[];
  safetyLines: string[];
  shortcutLines: string[];
  sessionSummaryLine?: string;
  lockCountLine?: string;
  memorySuggestionLine?: string;
  memorySuggestionSummaryLine?: string;
  reviewLines: string[];
  title: string;
  workLines: string[];
}

export interface StatusBarViewModel {
  activeTaskLabel?: string;
  approvalLabel: string;
  codeIntelligenceLabel?: string | null;
  gitBranch?: string | null;
  modeLabel: string;
  providerConfidenceLabel?: string | null;
  providerLabel: string;
  repoMapLabel?: string | null;
  sessionLabel?: string | null;
  sessionCountLabel?: string | null;
  lockCountLabel?: string | null;
  statusLabel: string;
  usageLabel?: string | null;
  workspaceLabel: string;
}

export interface ErrorPanelViewModel {
  color: 'red' | 'yellow';
  details: string;
  icon: string;
  message: string;
  title: string;
}

interface HomeDashboardModelInput {
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
  workspacePath: string;
}

interface StatusBarModelInput {
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
  provider: string;
  providerConfidence?: string | null;
  repoMapStatus?: string | null;
  sessionId?: string;
  status: string;
  usageSummary?: string | null;
}

const getErrorColor = (type: ErrorPanelProps['type']): 'red' | 'yellow' => {
  if (type === 'provider-error') {
    return 'yellow';
  }

  return 'red';
};

const getErrorIcon = (type: ErrorPanelProps['type']): string => {
  switch (type) {
    case 'permission':
      return '🔒';
    case 'tool-failure':
      return '⚠️';
    case 'provider-error':
      return '🌐';
    case 'mcp-error':
      return '📡';
    case 'plugin-error':
      return '🧩';
    case 'config-error':
      return '⚙️';
    default:
      return '❌';
  }
};

export const buildHomeDashboardViewModel = ({
  activeTask,
  agentLocks = [],
  agentSessions = [],
  approvalMode = 'ask',
  codeIntelligenceLine,
  gitBranch,
  historyHint,
  localOnly = false,
  memorySuggestionCount = 0,
  memorySuggestionSummary,
  modeLabel,
  model,
  projectSummary,
  provider,
  providerConfidence,
  recentSessions,
  setupNeeded = false,
  shortcuts,
  teamRunCount = 0,
  title,
  workspacePath,
}: HomeDashboardModelInput): HomeDashboardViewModel => {
  const workspaceName = path.basename(workspacePath) || workspacePath;

  // Count sessions by status
  const runningCount = agentSessions.filter((s) => s.status === 'running').length;
  const queuedCount = agentSessions.filter((s) => s.status === 'queued').length;
  const pausedCount = agentSessions.filter((s) => s.status === 'paused').length;
  const lockCount = agentLocks.length;

  // Build session summary line
  let sessionSummaryLine: string | undefined;
  if (runningCount > 0 || queuedCount > 0 || pausedCount > 0) {
    const counts = [];
    if (runningCount > 0) counts.push(`running:${runningCount}`);
    if (queuedCount > 0) counts.push(`queued:${queuedCount}`);
    if (pausedCount > 0) counts.push(`paused:${pausedCount}`);
    sessionSummaryLine = `Agent Sessions — ${counts.join(' | ')}`;
  }

  // Build lock count line
  let lockCountLine: string | undefined;
  if (lockCount > 0) {
    lockCountLine = `File Locks — ${lockCount} file${lockCount === 1 ? '' : 's'} locked`;
  }

  return {
    activeTaskLine: activeTask
      ? `${activeTask.status} | ${activeTask.mode} | ${compactLine(activeTask.goal)}`
      : 'No active task plan. Try /explain repo, /fix tests, or /team plan fix failing tests.',
    agentReadyLines: [
      `Provider: ${formatPromptText(provider)}/${formatPromptText(model)}${providerConfidence ? ` (${formatPromptText(providerConfidence)})` : ''}`,
      `Approval: ${formatPromptText(approvalMode)} | Local only: ${localOnly ? 'yes' : 'no'}`,
      setupNeeded ? 'Setup needed: run /setup or apeironcode setup --provider mock.' : 'Ready: use /commands beginner for the shortest path.',
    ],
    codeIntelligenceLine: compactLine(formatPromptText(codeIntelligenceLine), 140),
    headerLine: `${workspaceName} | ${formatPromptText(provider)}/${formatPromptText(model)} | mode:${formatPromptText(modeLabel)}`,
    helpLines: [
      '/commands beginner | starter commands',
      '/setup | configure provider',
      '/doctor | diagnose environment',
    ],
    historyHint: historyHint ?? 'Use /commands, /sessions, /history, or /resume to continue previous work.',
    integrationLines: [
      `Team runs: ${teamRunCount}`,
      'GitHub: use /github status',
      'Skills: use /skills or /skill templates',
    ],
    lockCountLine,
    memorySuggestionLine: memorySuggestionCount > 0
      ? `Memory Suggestions — ${memorySuggestionCount} pending`
      : undefined,
    memorySuggestionSummaryLine: memorySuggestionSummary ? `Latest: ${compactLine(memorySuggestionSummary, 96)}` : undefined,
    projectPathLine: formatPromptText(workspacePath),
    projectStateLines: [
      `Git: ${gitBranch ? formatPromptText(gitBranch) : 'not detected'}`,
      `Project: ${formatPromptText(workspaceName)}`,
    ],
    projectSummary: compactLine(formatPromptText(projectSummary), 140),
    recentSessionLines: recentSessions.length > 0
      ? recentSessions.slice(0, 3).map((session) => `${compactLine(session.title, 72)} | ${session.provider}/${session.model} | ${session.updatedAt}`)
      : ['No saved sessions yet.'],
    reviewLines: [
      teamRunCount > 0 ? `Team runs: ${teamRunCount} | /team runs or /open cockpit` : 'No team runs yet. Try /team plan fix failing tests.',
      'Cockpit: /team cockpit <teamRunId>',
      'Patch/apply: /team merge-plan <teamRunId>',
    ],
    sessionSummaryLine,
    safetyLines: [
      lockCount > 0 ? `File locks: ${lockCount}` : 'File locks: none',
      'OS sandboxing: not enabled',
      'Credential isolation: shared process environment',
    ],
    shortcutLines: shortcuts.map((shortcut) => `${shortcut.command} | ${shortcut.description}`),
    title: formatPromptText(title),
    workLines: [
      sessionSummaryLine ?? 'No active background sessions.',
      recentSessions.length > 0 ? `Recent sessions: ${recentSessions.length} | /sessions` : 'No saved sessions yet. Try /session start "Explain this repo" --no-run.',
      teamRunCount > 0 ? `Latest team work available | /team runs` : 'No team artifacts yet.',
    ],
  };
};

export const buildStatusBarViewModel = ({
  activeMode,
  activeTaskId,
  activeTaskStatus,
  agentLocks = [],
  agentSessions = [],
  approvalMode,
  codeIntelligenceStatus,
  cwd,
  gitBranch,
  model,
  provider,
  providerConfidence,
  repoMapStatus,
  sessionId,
  status,
  usageSummary,
}: StatusBarModelInput): StatusBarViewModel => {
  // Count sessions by status
  const runningCount = agentSessions.filter((s) => s.status === 'running').length;
  const queuedCount = agentSessions.filter((s) => s.status === 'queued').length;
  const lockCount = agentLocks.length;

  // Build compact session count label (e.g., "1r" for 1 running, "2q" for 2 queued)
  let sessionCountLabel: string | null = null;
  if (runningCount > 0 || queuedCount > 0) {
    const parts = [];
    if (runningCount > 0) parts.push(`${runningCount}r`);
    if (queuedCount > 0) parts.push(`${queuedCount}q`);
    sessionCountLabel = `sessions:${parts.join(',')}`;
  }

  // Build compact lock count label
  let lockCountLabel: string | null = null;
  if (lockCount > 0) {
    lockCountLabel = `locks:${lockCount}`;
  }

  return {
    activeTaskLabel: activeTaskId ? `task:${activeTaskId.slice(0, 8)}:${activeTaskStatus}` : undefined,
    approvalLabel: formatPromptText(approvalMode),
    codeIntelligenceLabel: codeIntelligenceStatus ? `code:${formatPromptText(codeIntelligenceStatus)}` : null,
    gitBranch,
    lockCountLabel,
    modeLabel: `mode:${formatPromptText(activeMode)}`,
    providerConfidenceLabel: providerConfidence ? formatPromptText(providerConfidence) : null,
    providerLabel: provider === 'mock'
      ? 'Mock provider · testing only'
      : `${formatPromptText(provider)} / ${formatPromptText(model)}`,
    repoMapLabel: repoMapStatus ? `repo:${formatPromptText(repoMapStatus)}` : null,
    sessionCountLabel,
    sessionLabel: sessionId ? sessionId.slice(0, 8) : null,
    statusLabel: formatPromptText(status),
    usageLabel: usageSummary ? formatPromptText(usageSummary) : null,
    workspaceLabel: path.basename(cwd) || cwd,
  };
};

export const buildErrorPanelViewModel = ({
  details,
  message,
  title,
  type,
}: ErrorPanelProps): ErrorPanelViewModel => ({
  color: getErrorColor(type),
  details: formatPromptText(details),
  icon: getErrorIcon(type),
  message: formatPromptText(message),
  title: formatPromptText(title),
});
