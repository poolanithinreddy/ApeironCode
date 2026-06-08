import {Box} from 'ink';
import React from 'react';

import type {ChatMessage, TodoItem, ToolCallRecord} from '../agent/types.js';
import {isVerboseOutputEnabled} from '../agent/finalSummary.js';
import type {ApprovalRequest} from '../safety/approvals.js';
import type {AgentSessionRecord} from '../multisession/types.js';
import type {FileLock} from '../multisession/locks.js';
import type {EventBus} from '../core/events/bus.js';
import {useStreamingMessages} from './streamingState.js';
import {ApprovalPrompt} from './ApprovalPrompt.js';
import {ErrorPanel, type ErrorPanelProps} from './ErrorPanel.js';
import {InputBox} from './InputBox.js';
import {MessageList} from './MessageList.js';
import {SetupWizard, type SetupOptionId} from './SetupWizard.js';
import {StatusBar} from './StatusBar.js';
import {TodoPanel} from './TodoPanel.js';

interface ChatScreenProps {
  activeMode: string;
  activeTaskId?: string;
  activeTaskStatus?: string;
  agentLocks?: FileLock[];
  agentSessions?: AgentSessionRecord[];
  approvalInput: string;
  approvalMode: string;
  codeIntelligenceStatus?: string | null;
  cwd: string;
  dashboard?: React.ReactNode;
  errorDisplay?: ErrorPanelProps | null;
  eventBus?: EventBus;
  gitBranch?: string | null;
  inputValue: string;
  isBusy: boolean;
  messages: ChatMessage[];
  model: string;
  pendingApproval: ApprovalRequest | null;
  providerConfidence?: string | null;
  provider: string;
  repoMapStatus?: string | null;
  sessionId?: string;
  showSetup: boolean;
  status: string;
  todos: TodoItem[];
  toolCalls: ToolCallRecord[];
  usageSummary?: string | null;
  verbose?: boolean;
  onApprovalChange: (value: string) => void;
  onApprovalSubmit: (value: string) => void;
  onInputChange: (value: string) => void;
  onInputSubmit: (value: string) => void;
  onSetupSelect: (option: SetupOptionId) => void | Promise<void>;
}

export const ChatScreen = ({
  activeMode,
  activeTaskId,
  activeTaskStatus,
  agentLocks,
  agentSessions,
  approvalInput,
  approvalMode,
  codeIntelligenceStatus,
  cwd,
  dashboard,
  errorDisplay,
  eventBus,
  gitBranch,
  inputValue,
  isBusy,
  messages,
  model,
  onApprovalChange,
  onApprovalSubmit,
  onInputChange,
  onInputSubmit,
  onSetupSelect,
  pendingApproval,
  providerConfidence,
  provider,
  repoMapStatus,
  sessionId,
  showSetup,
  status,
  todos,
  toolCalls,
  usageSummary,
  verbose,
}: ChatScreenProps) => {
  const streamingMessages = useStreamingMessages(eventBus);
  const isVerbose = verbose ?? isVerboseOutputEnabled();

  return (
    <Box flexDirection="column">
      <StatusBar
        verbose={isVerbose}
        activeMode={activeMode}
        activeTaskId={activeTaskId}
        activeTaskStatus={activeTaskStatus}
        agentLocks={agentLocks}
        agentSessions={agentSessions}
        approvalMode={approvalMode}
        codeIntelligenceStatus={codeIntelligenceStatus}
        cwd={cwd}
        gitBranch={gitBranch}
        model={model}
        providerConfidence={providerConfidence}
        provider={provider}
        repoMapStatus={repoMapStatus}
        sessionId={sessionId}
        status={status}
        usageSummary={usageSummary}
      />
      {dashboard}
      <TodoPanel todos={todos} />
      <MessageList messages={messages} toolCalls={toolCalls} streamingMessages={streamingMessages} verbose={isVerbose} />
      {errorDisplay && <ErrorPanel {...errorDisplay} />}
      <Box marginTop={1}>
        {showSetup ? (
          <SetupWizard onSelect={onSetupSelect} />
        ) : pendingApproval ? (
          <ApprovalPrompt
            request={pendingApproval}
            value={approvalInput}
            onChange={onApprovalChange}
            onSubmit={onApprovalSubmit}
            riskLevel={pendingApproval.riskLevel}
            matchedRule={pendingApproval.matchedRule}
            verbose={isVerbose}
          />
        ) : (
          <InputBox
            disabled={isBusy}
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onInputSubmit}
          />
        )}
      </Box>
    </Box>
  );
};