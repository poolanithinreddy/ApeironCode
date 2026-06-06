export type ReviewCockpitPane =
  | 'actions'
  | 'artifacts'
  | 'conflicts'
  | 'events'
  | 'memory'
  | 'merge'
  | 'overview';

export interface ReviewCockpitState {
  help: boolean;
  pane: ReviewCockpitPane;
  selection: number;
}

export const REVIEW_COCKPIT_PANES: ReviewCockpitPane[] = [
  'overview',
  'artifacts',
  'conflicts',
  'memory',
  'merge',
  'events',
  'actions',
];

export const createReviewCockpitState = (): ReviewCockpitState => ({
  help: false,
  pane: 'overview',
  selection: 0,
});
