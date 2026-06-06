import {describe, expect, it} from 'vitest';

import {buildWelcomeDashboardModel, formatCompactHome, renderWelcomeDashboard} from '../../src/ui/welcomeDashboard.js';
import {stripAnsi} from '../../src/ui/theme.js';

describe('compact home', () => {
  it('renders ≤15 lines', () => {
    const output = formatCompactHome({
      version: '1.0.0',
      workspacePath: '/home/user/project',
      provider: 'anthropic',
      model: 'claude-sonnet',
      projectBrainStatus: 'active',
      mode: 'chat',
    });
    const lines = output.split('\n');
    expect(lines.length).toBeLessThanOrEqual(15);
  });

  it('includes provider and model in output', () => {
    const output = formatCompactHome({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
    expect(output).toContain('anthropic');
    expect(output).toContain('claude-sonnet');
  });

  it('shows setup hint for mock provider', () => {
    const output = formatCompactHome({
      provider: 'mock',
      model: 'mock-coder',
    });
    expect(output).toContain('apeironcode setup');
  });

  it('shows setup hint when provider is not configured', () => {
    const output = formatCompactHome({});
    expect(output).toContain('apeironcode setup');
  });

  it('does not show setup hint for real provider', () => {
    const output = formatCompactHome({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
    expect(output).not.toContain('apeironcode setup');
  });

  it('contains ApeironCode branding (not OpenCode)', () => {
    const output = formatCompactHome({provider: 'anthropic', model: 'claude-sonnet'});
    expect(output).toContain('ApeironCode');
    expect(output).not.toContain('OpenCode');
    expect(output).not.toContain('opencode');
  });

  it('does not leak secrets', () => {
    const output = formatCompactHome({
      provider: 'anthropic',
      model: 'claude-sonnet',
      workspacePath: '/tmp/sk-verysecret12345/project',
    });
    expect(output).not.toContain('sk-verysecret');
  });

  it('shows mode in the first line', () => {
    const output = formatCompactHome({mode: 'autonomous'});
    const firstLine = output.split('\n')[0] ?? '';
    expect(firstLine).toContain('autonomous');
  });

  it('shows version in the first line', () => {
    const output = formatCompactHome({version: '2.3.4'});
    const firstLine = output.split('\n')[0] ?? '';
    expect(firstLine).toContain('2.3.4');
  });
});

describe('welcome dashboard', () => {
  it('renders premium dashboard data without secrets', () => {
    const model = buildWelcomeDashboardModel({
      bridgeStatus: 'connected',
      brainStatus: 'active',
      cwd: '/Users/test/projects/apeiron',
      model: 'claude',
      permissionMode: 'ask',
      provider: 'anthropic',
      taskCount: 3,
      version: '1.2.3',
    });
    const output = stripAnsi(renderWelcomeDashboard(model, {colorMode: 'no-color', width: 72}));
    expect(output).toContain('ApeironCode');
    expect(output).toContain('Project Brain');
    expect(output).toContain('connected');
    expect(output).toContain('Try: build an app');
    expect(output).not.toContain('OpenCode');
  });

  it('redacts tokens and truncates narrow output', () => {
    const model = buildWelcomeDashboardModel({
      cwd: '/tmp/sk-verysecret1234567890/workspace',
      provider: 'openai',
      model: 'gpt',
      version: 'dev',
    });
    const output = stripAnsi(renderWelcomeDashboard(model, {colorMode: 'no-color', width: 44}));
    expect(output).not.toContain('sk-verysecret');
    expect(output.split('\n').every((line) => line.length <= 44)).toBe(true);
  });
});
