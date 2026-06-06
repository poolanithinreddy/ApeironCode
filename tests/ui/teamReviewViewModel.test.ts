import {describe, expect, it} from 'vitest';

import {buildTeamReviewViewModel, formatTeamReview} from '../../src/ui/teamReviewViewModel.js';

describe('team review view model', () => {
  it('renders missing and rich team run states', () => {
    expect(buildTeamReviewViewModel({run: null}).empty).toBe(true);

    const view = buildTeamReviewViewModel({
      mergePlans: [{
        conflictDetails: [{path: 'src/a.ts', reason: 'changed', type: 'main-changed'}],
        conflicts: ['src/a.ts'],
        createdAt: '2026-05-01T00:00:00.000Z',
        files: [{path: 'src/a.ts', status: 'modified'}],
        requiresApproval: true,
        teamRunId: 'team_1',
        workspaceId: 'workspace_1',
      }],
      run: {
        artifacts: [{createdAt: '2026-05-01T00:00:00.000Z', id: 'summary-1', kind: 'summary', path: 'summary-1.md', title: 'Summary'}],
        createdAt: '2026-05-01T00:00:00.000Z',
        goal: 'fix tests',
        ok: false,
        teamRunId: 'team_1',
      },
      workspaces: [{
        agentName: 'coder',
        cleanup: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        mainRoot: '/repo',
        mode: 'temp-copy',
        status: 'active',
        teamRunId: 'team_1',
        workspaceId: 'workspace_1',
        workspaceRoot: '/tmp/workspace',
      }],
    });

    expect(view.empty).toBe(false);
    expect(view.artifactLine).toContain('1');
    expect(view.conflictLine).toContain('1');
    expect(formatTeamReview(view)).toContain('apeironcode team artifacts team_1');
  });
});
