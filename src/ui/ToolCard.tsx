import {Box, Text} from 'ink';
import React from 'react';

import type {ToolCallRecord} from '../agent/types.js';
import {DiffView} from './DiffView.js';
import {buildToolCardView, renderToolLine} from './toolCards.js';

interface ToolCardProps {
  toolCall: ToolCallRecord;
  durationMs?: number;
  permissionDecision?: 'allow' | 'deny' | 'approved' | 'rejected' | 'ask';
  verbose?: boolean;
}

const getStatusColor = (
  status: ToolCallRecord['status'],
): 'yellow' | 'green' | 'red' | 'cyan' => {
  if (status === 'success') {
    return 'green';
  }

  if (status === 'error') {
    return 'red';
  }

  if (status === 'running') {
    return 'yellow';
  }

  return 'cyan';
};

const getToolSource = (toolName: string): 'builtin' | 'plugin' | 'mcp' => {
  if (toolName.startsWith('plugin:')) {
    return 'plugin';
  }
  if (toolName.startsWith('mcp:')) {
    return 'mcp';
  }
  return 'builtin';
};

const getPermissionColor = (decision?: string): 'green' | 'red' | 'yellow' => {
  if (decision === 'allow' || decision === 'approved') return 'green';
  if (decision === 'deny' || decision === 'rejected') return 'red';
  return 'yellow';
};

export const ToolCard = ({toolCall, durationMs, permissionDecision, verbose = false}: ToolCardProps) => {
  // Normal mode: one calm line per tool call, no border, no raw diff.
  if (!verbose) {
    return (
      <Text color={getStatusColor(toolCall.status)}>{renderToolLine(toolCall)}</Text>
    );
  }

  // Debug/verbose mode: full detailed card with metadata and diff.
  const source = getToolSource(toolCall.toolName);
  const view = buildToolCardView(toolCall);
  const editId = typeof toolCall.result?.metadata?.editId === 'string' ? toolCall.result.metadata.editId : null;
  const filePath = typeof toolCall.result?.metadata?.filePath === 'string' ? toolCall.result.metadata.filePath : null;
  const addedLines = typeof toolCall.result?.metadata?.addedLines === 'number' ? toolCall.result.metadata.addedLines : null;
  const removedLines = typeof toolCall.result?.metadata?.removedLines === 'number' ? toolCall.result.metadata.removedLines : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={getStatusColor(toolCall.status)} paddingX={1}>
      <Box>
        <Text color={getStatusColor(toolCall.status)}>{view.symbol} </Text>
        <Text color={getStatusColor(toolCall.status)} bold>{toolCall.toolName}</Text>
        <Text dimColor> [{source}]</Text>
        {permissionDecision && (
          <Text color={getPermissionColor(permissionDecision)}> {permissionDecision}</Text>
        )}
      </Box>
      {toolCall.explanation ? <Text dimColor>{toolCall.explanation}</Text> : null}
      {toolCall.result?.summary ? <Text>{toolCall.result.summary}</Text> : null}
      {durationMs !== undefined && toolCall.status !== 'running' && (
        <Text dimColor>{durationMs}ms</Text>
      )}
      {toolCall.error ? <Text color="red">{toolCall.error}</Text> : null}
      {editId || filePath || addedLines !== null || removedLines !== null ? (
        <Box flexDirection="column">
          {editId ? <Text dimColor>edit id: {editId}</Text> : null}
          {filePath ? <Text dimColor>file: {filePath}</Text> : null}
          {addedLines !== null || removedLines !== null ? (
            <Text dimColor>diff: +{addedLines ?? 0} / -{removedLines ?? 0}</Text>
          ) : null}
          {editId ? <Text dimColor>Use /revert {editId} to undo.</Text> : null}
        </Box>
      ) : null}
      {toolCall.result?.diff ? <DiffView diff={toolCall.result.diff} /> : null}
    </Box>
  );
};
