import {Box, Text} from 'ink';
import React from 'react';

import type {MergePlan, SubagentWorkspace} from '../agents/workspace/types.js';
import type {TeamRunRecord} from '../agents/artifacts/types.js';
import {buildTeamReviewViewModel} from './teamReviewViewModel.js';

export const TeamReviewViewer = ({
  mergePlans,
  run,
  workspaces,
}: {
  mergePlans?: MergePlan[];
  run: TeamRunRecord | null;
  workspaces?: SubagentWorkspace[];
}) => {
  const view = buildTeamReviewViewModel({mergePlans, run, workspaces});
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{view.title}</Text>
      <Text>{view.statusLine}</Text>
      <Text>{view.artifactLine}</Text>
      <Text>{view.mergeLine}</Text>
      <Text color={view.conflictLine.endsWith(': 0') ? 'green' : 'red'}>{view.conflictLine}</Text>
      {view.workspaceLines.map((line) => <Text key={line} dimColor>{line}</Text>)}
      {view.actionHints.map((hint) => <Text key={hint} dimColor>{hint}</Text>)}
    </Box>
  );
};
