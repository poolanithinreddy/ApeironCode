import {describe, expect, it} from 'vitest';

import {
  formatVerificationPlan,
  planVerification,
  selectVerificationCommands,
  shouldRunTestsForChange,
} from '../../src/agent/verificationPlanner.js';

describe('verificationPlanner', () => {
  it('skips tests for documentation-only changes', () => {
    const plan = planVerification({changedFiles: ['README.md'], testCommand: 'npm test'});

    expect(shouldRunTestsForChange(['README.md'])).toBe(false);
    expect(plan.commands).toHaveLength(0);
    expect(plan.riskLevel).toBe('low');
  });

  it('selects typecheck, lint, and tests for TypeScript source changes', () => {
    const commands = selectVerificationCommands(['src/a.ts'], {changedFiles: ['src/a.ts'], testCommand: 'npm test'});

    expect(commands.map((command) => command.command)).toEqual(expect.arrayContaining(['npm test', 'npm run typecheck', 'npm run lint']));
  });

  it('reruns failing tests first in test-fix mode', () => {
    const plan = planVerification({
      changedFiles: ['src/math.ts'],
      failingCommand: 'npm test -- math',
      mode: 'test-fix',
      testCommand: 'npm test',
    });

    expect(plan.commands[0]?.command).toBe('npm test -- math');
    expect(formatVerificationPlan(plan)).toContain('rerun failing test first');
  });

  it('treats package/config changes as high risk and broader validation', () => {
    const plan = planVerification({buildCommand: 'npm run build', changedFiles: ['package.json']});

    expect(plan.riskLevel).toBe('high');
    expect(plan.commands.some((command) => command.type === 'build')).toBe(true);
  });
});
