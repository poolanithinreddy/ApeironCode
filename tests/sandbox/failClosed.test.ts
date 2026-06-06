import {describe, expect, it} from 'vitest';

import {getSandboxFallbackDecision} from '../../src/sandbox/manager.js';
import {parseShellCommand} from '../../src/safety/shell/parseCommand.js';
import {classifyCommandSemantics} from '../../src/safety/shell/commandSemantics.js';

const sem = (raw: string) => classifyCommandSemantics(parseShellCommand(raw));

describe('sandbox fail-closed fallback', () => {
  it('denies risky command when policy is never', () => {
    const decision = getSandboxFallbackDecision(sem('rm -rf /tmp/foo'), 'never');
    expect(decision.allowed).toBe(false);
    expect(decision.warning).toBeDefined();
  });

  it('denies risky command when policy is safe-readonly', () => {
    const decision = getSandboxFallbackDecision(sem('rm -rf /tmp/foo'), 'safe-readonly');
    expect(decision.allowed).toBe(false);
  });

  it('allows safe read-only command when policy is safe-readonly', () => {
    const decision = getSandboxFallbackDecision(sem('cat README.md'), 'safe-readonly');
    expect(decision.allowed).toBe(true);
    expect(decision.warning).toBeDefined();
  });

  it('denies network command when policy is safe-readonly', () => {
    const decision = getSandboxFallbackDecision(sem('curl https://example.com'), 'safe-readonly');
    expect(decision.allowed).toBe(false);
  });

  it('always policy allows safe with warning', () => {
    const decision = getSandboxFallbackDecision(sem('ls'), 'always');
    expect(decision.allowed).toBe(true);
    expect(decision.warning).toBeDefined();
  });

  it('always policy allows risky but warns', () => {
    const decision = getSandboxFallbackDecision(sem('rm -rf /tmp/foo'), 'always');
    expect(decision.allowed).toBe(true);
    expect(decision.warning).toContain('risky');
  });
});
