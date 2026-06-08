import {Box, Text} from 'ink';
import React from 'react';

import type {TeamArtifact} from '../agents/artifacts/types.js';
import {buildArtifactBrowserViewModel} from './artifactBrowserViewModel.js';

export const ArtifactBrowser = ({
  artifacts,
  selected,
}: {
  artifacts: TeamArtifact[];
  selected?: {artifactId: string; content: string} | null;
}) => {
  const view = buildArtifactBrowserViewModel(artifacts, selected);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{view.title}</Text>
      <Text dimColor>{view.filterLine}</Text>
      <Text color={view.redactionLine.includes('applied') ? 'yellow' : 'green'}>{view.redactionLine}</Text>
      {view.empty ? <Text dimColor>No artifacts recorded.</Text> : view.groups.map((group) => (
        <Box key={group.kind} flexDirection="column" marginTop={1}>
          <Text bold>{group.kind}</Text>
          {group.artifacts.map((artifact) => <Text key={artifact.id}>{artifact.line}</Text>)}
        </Box>
      ))}
      {view.detailLines.map((line) => <Text key={line.slice(0, 40)} dimColor>{line}</Text>)}
    </Box>
  );
};
