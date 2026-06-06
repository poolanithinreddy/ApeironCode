import {describe, expect, it} from 'vitest';

import {buildWelcomeDashboardModel, renderWelcomeDashboard} from '../../src/ui/welcomeDashboard.js';
import {renderPermissionCard, renderDiffSummaryCard, renderErrorCard, renderBrainContextCard} from '../../src/ui/toolCards.js';
import {stripAnsi} from '../../src/ui/theme.js';

describe('CLI premium output assertions', () => {
  it('renders stable no-color dashboard and cards', () => {
    const dashboard = renderWelcomeDashboard(buildWelcomeDashboardModel({
      brainStatus: 'active',
      bridgeStatus: 'connected',
      cwd: '/repo',
      model: 'mock',
      provider: 'mock',
      version: '0.1.0',
    }), {colorMode: 'no-color', width: 80});
    const cards = [
      renderPermissionCard({action: 'write file', risk: 'high'}, {colorMode: 'no-color'}),
      renderDiffSummaryCard({files: 1, insertions: 2, deletions: 0}, {colorMode: 'no-color'}),
      renderBrainContextCard({status: 'used', files: 2}, {colorMode: 'no-color'}),
      renderErrorCard({message: 'Bearer topsecret'}, {colorMode: 'no-color'}),
    ].join('\n');
    const output = stripAnsi(`${dashboard}\n${cards}`);
    expect(output).toContain('ApeironCode');
    expect(output).toContain('Project Brain');
    expect(output).not.toContain('OpenCode');
    expect(output).not.toContain('topsecret');
  });
});
