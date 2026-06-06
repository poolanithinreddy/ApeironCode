import {Box, Text} from 'ink';
import React from 'react';

import {buildApprovalReviewViewModel, type ApprovalReviewInput} from '../safety/approvalFormat.js';

export const ApprovalReviewPanel = (props: ApprovalReviewInput) => {
  const view = buildApprovalReviewViewModel(props);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={props.riskLevel === 'high' ? 'red' : 'yellow'} paddingX={1}>
      <Text>{view.actionLine}</Text>
      <Text color={props.riskLevel === 'high' ? 'red' : 'yellow'}>{view.riskLine}</Text>
      <Text>{view.targetLine}</Text>
      <Text>{view.reasonLine}</Text>
      <Text dimColor>{view.ruleLine}</Text>
      {view.fileLines.length > 0 ? (
        <>
          <Text>Files affected:</Text>
          {view.fileLines.map((line) => <Text key={line} dimColor>{line}</Text>)}
        </>
      ) : null}
      {view.previewLines.length > 0 ? (
        <>
          <Text>Preview:</Text>
          {view.previewLines.map((line, index) => <Text key={`${line}:${index}`} dimColor>{line}</Text>)}
        </>
      ) : null}
    </Box>
  );
};
