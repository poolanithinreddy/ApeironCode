import {Box, Text} from 'ink';
import React from 'react';

import type {MergePlan} from '../agents/workspace/types.js';
import {buildConflictReviewViewModel} from './conflictReviewViewModel.js';

export const ConflictReviewViewer = ({plans}: {plans: MergePlan[]}) => {
  const view = buildConflictReviewViewModel(plans);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text color="red">{view.title}</Text>
      {view.empty ? (
        <Text dimColor>No conflicts detected.</Text>
      ) : view.items.map((item) => (
        <Box key={item.fileLine} flexDirection="column" marginTop={1}>
          <Text>{item.fileLine}</Text>
          <Text color="yellow">{item.typeLine}</Text>
          <Text color="red">{item.riskLine}</Text>
          <Text dimColor>{item.reasonLine}</Text>
          <Text dimColor>{item.baseLine}</Text>
          <Text dimColor>{item.mainLine}</Text>
          <Text dimColor>{item.workspaceLine}</Text>
          <Text dimColor>{item.recommendationLine}</Text>
        </Box>
      ))}
    </Box>
  );
};
