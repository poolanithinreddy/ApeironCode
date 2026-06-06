import {REVIEW_COCKPIT_PANES, type ReviewCockpitState} from './reviewCockpitState.js';

export type ReviewCockpitKey =
  | '?'
  | 'a'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'd'
  | 'e'
  | 'Enter'
  | 'c'
  | 'g'
  | 'm'
  | 'q'
  | 'r';

export interface ReviewCockpitKeyResult {
  action?: 'apply' | 'back' | 'discard' | 'export' | 'open' | 'reject';
  state: ReviewCockpitState;
}

const movePane = (pane: ReviewCockpitState['pane'], delta: number): ReviewCockpitState['pane'] => {
  const index = REVIEW_COCKPIT_PANES.indexOf(pane);
  const next = (index + delta + REVIEW_COCKPIT_PANES.length) % REVIEW_COCKPIT_PANES.length;
  return REVIEW_COCKPIT_PANES[next] ?? 'overview';
};

export const reduceReviewCockpitKey = (
  state: ReviewCockpitState,
  key: ReviewCockpitKey,
  itemCount = 0,
): ReviewCockpitKeyResult => {
  switch (key) {
    case '?':
      return {state: {...state, help: !state.help}};
    case 'ArrowLeft':
      return {state: {...state, pane: movePane(state.pane, -1), selection: 0}};
    case 'ArrowRight':
      return {state: {...state, pane: movePane(state.pane, 1), selection: 0}};
    case 'ArrowUp':
      return {state: {...state, selection: Math.max(0, state.selection - 1)}};
    case 'ArrowDown':
      return {state: {...state, selection: Math.min(Math.max(0, itemCount - 1), state.selection + 1)}};
    case 'Enter':
      return {action: 'open', state};
    case 'm':
      return {state: {...state, pane: 'merge', selection: 0}};
    case 'c':
      return {state: {...state, pane: 'conflicts', selection: 0}};
    case 'g':
      return {state: {...state, pane: 'memory', selection: 0}};
    case 'a':
      return {action: 'apply', state};
    case 'r':
      return {action: 'reject', state};
    case 'd':
      return {action: 'discard', state};
    case 'e':
      return {action: 'export', state};
    case 'q':
      return {action: 'back', state};
  }
};
