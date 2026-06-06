import {describe, expect, it} from 'vitest';

import {reduceReviewCockpitKey} from '../../src/ui/reviewCockpitKeys.js';
import {createReviewCockpitState} from '../../src/ui/reviewCockpitState.js';
import {buildReviewCockpitViewModel, formatReviewCockpit} from '../../src/ui/reviewCockpitViewModel.js';

describe('review cockpit', () => {
  it('switches panes, moves selection, and toggles help', () => {
    let result = reduceReviewCockpitKey(createReviewCockpitState(), 'ArrowRight', 3);
    expect(result.state.pane).toBe('artifacts');
    result = reduceReviewCockpitKey(result.state, 'ArrowDown', 3);
    expect(result.state.selection).toBe(1);
    result = reduceReviewCockpitKey(result.state, '?', 3);
    expect(result.state.help).toBe(true);
    expect(reduceReviewCockpitKey(result.state, 'a', 3).action).toBe('apply');
    expect(reduceReviewCockpitKey(result.state, 'm', 3).state.pane).toBe('merge');
    expect(reduceReviewCockpitKey(result.state, 'c', 3).state.pane).toBe('conflicts');
    expect(reduceReviewCockpitKey(result.state, 'g', 3).state.pane).toBe('memory');
  });

  it('formats overview with security notices and action hints', () => {
    const view = buildReviewCockpitViewModel({
      mergePlans: [],
      memorySuggestions: [],
      run: {
        artifacts: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        goal: 'review auth',
        ok: true,
        teamRunId: 'team_1',
      },
      state: createReviewCockpitState(),
      workspaces: [],
    });
    expect(formatReviewCockpit(view)).toContain('Review Cockpit: team_1');
    expect(view.securityNotice).toContain('no OS sandboxing');
  });
});
