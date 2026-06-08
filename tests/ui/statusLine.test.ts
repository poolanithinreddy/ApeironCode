import {describe, expect, it} from 'vitest';

import {normalizeStatusLabel, renderCompactStatusLine, renderPromptHint, renderStatusLine} from '../../src/ui/statusLine.js';
import {stripAnsi} from '../../src/ui/theme.js';

describe('status line', () => {
  it('renders states compactly and safely', () => {
    const output = stripAnsi(renderStatusLine({
      brainActive: true,
      bridgeConnected: true,
      mode: 'coding',
      model: 'qwen',
      permissionMode: 'ask',
      provider: 'ollama',
      task: 'build',
      tokenBudget: '42%',
    }, {colorMode: 'no-color', width: 120}));
    expect(output).toContain('brain:on');
    expect(output).toContain('bridge:on');
    expect(output).toContain('coding');
  });

  it('redacts and truncates prompt hints', () => {
    const hint = stripAnsi(renderPromptHint({mode: 'idle', brainActive: false}, {colorMode: 'no-color', width: 42}));
    expect(hint.length).toBeLessThanOrEqual(42);
    expect(hint).toContain('Try:');
  });
});

describe('compact status line (Phase 18B)', () => {
  it('renders app, provider/model, workspace and a calm status', () => {
    const line = stripAnsi(renderCompactStatusLine({
      provider: 'openai',
      model: 'gpt-4o',
      workspace: 'calculator-test',
      status: 'idle',
    }, {colorMode: 'no-color', width: 120}));
    expect(line).toBe('ApeironCode · openai/gpt-4o · calculator-test · ready');
  });

  it('normalizes internal statuses into user-facing labels', () => {
    expect(normalizeStatusLabel('idle')).toBe('ready');
    expect(normalizeStatusLabel('awaiting_approval')).toBe('awaiting approval');
    expect(normalizeStatusLabel('applying')).toBe('applying');
    expect(normalizeStatusLabel('validating')).toBe('validating');
  });

  it('hides low-level internal fields (no brain/bridge/perm/tokens)', () => {
    const line = stripAnsi(renderCompactStatusLine({
      provider: 'ollama',
      model: 'qwen',
      workspace: 'repo',
      status: 'thinking',
      mode: 'feature',
    }, {colorMode: 'no-color', width: 120}));
    expect(line).not.toMatch(/brain:|bridge:|perm:|tokens:/u);
    expect(line).toContain('thinking');
    expect(line).toContain('feature');
  });

  it('labels the mock provider as testing only', () => {
    const line = stripAnsi(renderCompactStatusLine({provider: 'mock', model: 'mock', workspace: 'r', status: 'ready'}, {colorMode: 'no-color'}));
    expect(line).toContain('mock · testing only');
  });
});
