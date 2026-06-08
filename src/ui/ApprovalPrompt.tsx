import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';

import type {ApprovalRequest} from '../safety/approvals.js';
import {formatPromptText} from '../utils/display.js';
import {ApprovalReviewPanel} from './ApprovalReviewPanel.js';
import {DiffView} from './DiffView.js';

interface ApprovalPromptProps {
  request: ApprovalRequest;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  riskLevel?: string;
  matchedRule?: string;
  verbose?: boolean;
}

const getRiskColor = (risk?: string): 'red' | 'yellow' | 'green' => {
  if (risk === 'critical' || risk === 'high') return 'red';
  if (risk === 'medium') return 'yellow';
  return 'green';
};

export const ApprovalPrompt = ({
  onChange,
  onSubmit,
  request,
  value,
  riskLevel,
  matchedRule,
  verbose = false,
}: ApprovalPromptProps) => {
  const helperText = request.requiresExtraConfirmation
    ? 'YES = approve · anything else = deny'
    : 'y = approve · n = deny';
  const title = formatPromptText(request.title);
  const message = formatPromptText(request.message);
  // The preview/details already lists Files / Commands / Validation cleanly,
  // so normal mode shows it directly instead of a second nested review box.
  const detailLines = formatPromptText(request.details).split('\n').filter(Boolean);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={getRiskColor(riskLevel)} paddingX={1}>
      <Text color={getRiskColor(riskLevel)} bold>{title}</Text>
      <Text>{message}</Text>
      {riskLevel && (
        <Text color={getRiskColor(riskLevel)}>Risk: {riskLevel}</Text>
      )}
      {detailLines.map((line, index) => (
        <Text key={`detail:${index}`} dimColor>{line}</Text>
      ))}
      {verbose && matchedRule ? <Text dimColor>Rule: {matchedRule}</Text> : null}
      {verbose ? (
        <ApprovalReviewPanel
          action={title}
          matchedRule={matchedRule}
          preview={request.diff ?? request.details}
          reason={message}
          riskLevel={request.riskLevel}
          target={request.resource}
        />
      ) : null}
      {verbose && request.diff ? <DiffView diff={request.diff} /> : null}
      <Text dimColor>{helperText}</Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
};
