import {Box, Text, useInput} from 'ink';
import React, {useState} from 'react';

import type {TeamRunRecord} from '../agents/artifacts/types.js';
import type {MergePlan, SubagentWorkspace} from '../agents/workspace/types.js';
import type {MemorySuggestion} from '../memory/suggestions.js';
import type {DashboardActionBanner} from './dashboardTypes.js';
import {buildReviewCockpitViewModel} from './reviewCockpitViewModel.js';
import {createReviewCockpitState, type ReviewCockpitState} from './reviewCockpitState.js';
import {reduceReviewCockpitKey, type ReviewCockpitKey, type ReviewCockpitKeyResult} from './reviewCockpitKeys.js';

export const ReviewCockpit = ({
  actionBanner,
  mergePlans,
  memorySuggestions,
  run,
  state = createReviewCockpitState(),
  workspaces,
  interactive = false,
  onAction,
  onClose,
}: {
  actionBanner?: DashboardActionBanner;
  interactive?: boolean;
  mergePlans: MergePlan[];
  memorySuggestions: MemorySuggestion[];
  onAction?: (result: ReviewCockpitKeyResult) => void | Promise<void>;
  onClose?: () => void;
  run: TeamRunRecord | null;
  state?: ReviewCockpitState;
  workspaces: SubagentWorkspace[];
}) => {
  const [localState, setLocalState] = useState(state);
  const activeState = interactive ? localState : state;
  const view = buildReviewCockpitViewModel({mergePlans, memorySuggestions, run, state: activeState, workspaces});
  const bannerColor = actionBanner?.kind === 'success'
    ? 'green'
    : actionBanner?.kind === 'error'
      ? 'red'
      : actionBanner?.kind === 'warning'
        ? 'yellow'
        : 'cyan';

  useInput((input, key) => {
    if (!interactive) {
      return;
    }
    const mappedKey: ReviewCockpitKey | null = key.leftArrow
      ? 'ArrowLeft'
      : key.rightArrow
        ? 'ArrowRight'
        : key.upArrow
          ? 'ArrowUp'
          : key.downArrow
            ? 'ArrowDown'
            : key.return
              ? 'Enter'
              : input === '?' || input === 'a' || input === 'r' || input === 'd' || input === 'e' || input === 'q' || input === 'm' || input === 'c' || input === 'g'
                ? input
                : null;
    if (!mappedKey) {
      return;
    }
    const result = reduceReviewCockpitKey(localState, mappedKey, view.detailLines.length);
    setLocalState(result.state);
    if (result.action === 'back') {
      onClose?.();
      return;
    }
    if (result.action) {
      void onAction?.(result);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta">{view.title}</Text>
      <Text>{view.paneLine}</Text>
      {actionBanner && (
        <Box flexDirection="column" marginY={1} borderStyle="single" borderColor={bannerColor} paddingX={1}>
          <Text color={bannerColor}>{actionBanner.message}</Text>
          {actionBanner.preview && <Text dimColor>{actionBanner.preview.slice(0, 1200)}</Text>}
        </Box>
      )}
      <Text color="yellow">{view.securityNotice}</Text>
      {view.detailLines.map((line) => <Text key={line.slice(0, 80)}>{line}</Text>)}
      {view.actionHints.map((hint) => <Text key={hint} dimColor>{hint}</Text>)}
      {view.helpLines.map((line) => <Text key={line} color="cyan">{line}</Text>)}
    </Box>
  );
};
