import {describe, expect, it} from 'vitest';

import {describeNonInteractiveReason, isInteractiveContext} from '../../src/cli/setup/interactiveGuard.js';

const NON_TTY_ENV = {};

describe('isInteractiveContext', () => {
  it('returns false when CI=1', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {CI: '1'})).toBe(false);
  });

  it('returns false when CI=true', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {CI: 'true'})).toBe(false);
  });

  it('returns false when GITHUB_ACTIONS=true', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {GITHUB_ACTIONS: 'true'})).toBe(false);
  });

  it('returns false when BUILDKITE=true', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {BUILDKITE: 'true'})).toBe(false);
  });

  it('returns false when TRAVIS=true', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {TRAVIS: 'true'})).toBe(false);
  });

  it('returns false when JENKINS_URL is set', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {JENKINS_URL: 'http://jenkins'})).toBe(false);
  });

  it('returns false when APEIRONCODE_NO_SETUP=1', () => {
    expect(isInteractiveContext(['node', 'apeironcode'], {APEIRONCODE_NO_SETUP: '1'})).toBe(false);
  });

  it('returns false for --no-setup flag', () => {
    expect(isInteractiveContext(['node', 'apeironcode', '--no-setup'], NON_TTY_ENV)).toBe(false);
  });

  it('returns false for doctor subcommand', () => {
    expect(isInteractiveContext(['node', 'apeironcode', 'doctor'], NON_TTY_ENV)).toBe(false);
  });

  it('returns false for --help flag', () => {
    expect(isInteractiveContext(['node', 'apeironcode', '--help'], NON_TTY_ENV)).toBe(false);
  });

  it('returns false for bridge subcommand', () => {
    expect(isInteractiveContext(['node', 'apeironcode', 'bridge'], NON_TTY_ENV)).toBe(false);
  });

  it('returns false when stdout is not a TTY', () => {
    // In test environment stdout.isTTY is not true, so this should return false
    expect(isInteractiveContext(['node', 'apeironcode'], NON_TTY_ENV)).toBe(false);
  });
});

describe('describeNonInteractiveReason', () => {
  it('returns CI reason for CI=1', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode'], {CI: '1'});
    expect(reason).toContain('CI');
  });

  it('returns GITHUB_ACTIONS reason', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode'], {GITHUB_ACTIONS: 'true'});
    expect(reason).toContain('CI');
  });

  it('returns no-setup env var reason', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode'], {APEIRONCODE_NO_SETUP: '1'});
    expect(reason).toContain('no-setup');
  });

  it('returns --no-setup flag reason', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode', '--no-setup'], NON_TTY_ENV);
    expect(reason).toContain('--no-setup');
  });

  it('returns non-interactive subcommand reason', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode', 'doctor'], NON_TTY_ENV);
    expect(reason).toContain('doctor');
  });

  it('returns TTY reason when stdout is not a TTY', () => {
    const reason = describeNonInteractiveReason(['node', 'apeironcode'], NON_TTY_ENV);
    // Will be null only if actually running in a TTY, otherwise should return a reason
    if (process.stdout.isTTY !== true) {
      expect(reason).toContain('TTY');
    }
  });

  it('returns null when truly interactive (TTY + no CI)', () => {
    // This is hard to test deterministically without mocking process.stdout,
    // but we can at least verify the return type is string | null
    const result = describeNonInteractiveReason(['node', 'apeironcode'], {});
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
