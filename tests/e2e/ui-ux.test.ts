import {describe, expect, it} from 'vitest';

import {buildWelcomeDashboardModel, renderWelcomeDashboard} from '../../src/ui/welcomeDashboard.js';
import {renderPermissionCard, renderToolResultCard} from '../../src/ui/toolCards.js';
import {stripAnsi} from '../../src/ui/theme.js';

describe('Premium UI/UX E2E', () => {
  it('CLI welcome dashboard renders without secrets and supports no-color', () => {
    const output = stripAnsi(renderWelcomeDashboard(buildWelcomeDashboardModel({
      brainStatus: 'active',
      bridgeStatus: 'connected',
      cwd: '/tmp/project',
      model: 'qwen',
      provider: 'ollama',
      version: '0.1.0',
    }), {colorMode: 'no-color', width: 72}));
    expect(output).toContain('ApeironCode');
    expect(output).toContain('Project Brain');
    expect(output).toContain('Bridge');
    expect(output).not.toContain(String.fromCharCode(27));
    expect(output).not.toContain('OpenCode');
  });

  it('permission and tool cards preserve risk while truncating secret output', () => {
    const output = [
      renderPermissionCard({action: 'modify package.json', risk: 'high'}, {colorMode: 'no-color'}),
      renderToolResultCard({ok: false, toolName: 'run_command', output: `failure Bearer secret-token ${'x'.repeat(500)}`}, {colorMode: 'no-color', width: 80}),
    ].join('\n');
    expect(output).toContain('risk: high');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('secret-token');
  });

});
