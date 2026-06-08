import {describe, expect, it} from 'vitest';

import {buildArtifactBrowserViewModel, formatArtifactBrowser} from '../../src/ui/artifactBrowserViewModel.js';

describe('artifact browser view model', () => {
  it('groups artifacts and redacts selected details', () => {
    const artifacts = [
      {createdAt: '2026-05-01T00:00:00.000Z', id: 'plan-1', kind: 'plan' as const, path: 'plan-1.md', title: 'Plan'},
      {createdAt: '2026-05-01T00:00:00.000Z', id: 'summary-1', kind: 'summary' as const, path: 'summary-1.md', title: 'Summary'},
    ];

    const view = buildArtifactBrowserViewModel(artifacts, {
      artifactId: 'summary-1',
      content: 'Token: sk-test-secret1234567890',
    });

    expect(view.groups).toHaveLength(2);
    expect(view.detailLines.join('\n')).not.toContain('sk-test-secret1234567890');
    expect(formatArtifactBrowser(artifacts, 'team_1')).toContain('apeironcode team artifact team_1');
    expect(buildArtifactBrowserViewModel(artifacts, null, {filter: 'summary'}).groups).toHaveLength(1);
    expect(buildArtifactBrowserViewModel(artifacts, null, {search: 'plan'}).title).toContain('1/2');
  });
});
