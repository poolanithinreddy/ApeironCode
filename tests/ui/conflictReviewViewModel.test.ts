import {describe, expect, it} from 'vitest';

import {buildConflictReviewViewModel} from '../../src/ui/conflictReviewViewModel.js';

describe('conflict review view model', () => {
  it('renders empty and conflict states', () => {
    expect(buildConflictReviewViewModel([]).empty).toBe(true);
    const view = buildConflictReviewViewModel([{
      conflictDetails: [{
        path: 'src/a.ts',
        reason: 'Main and isolated workspace both changed this file.',
        type: 'same-line',
      }],
      conflicts: ['src/a.ts'],
      createdAt: '2026-05-01T00:00:00.000Z',
      files: [],
      requiresApproval: false,
      teamRunId: 'team_1',
      workspaceId: 'workspace_1',
    }]);
    expect(view.empty).toBe(false);
    expect(view.items[0]?.fileLine).toBe('src/a.ts');
    expect(view.items[0]?.typeLine).toContain('same-line');
    expect(view.items[0]?.riskLine).toContain('medium');
    expect(view.items[0]?.mainLine).toContain('Main');
    expect(view.items[0]?.baseLine).toContain('Base');
  });
});
