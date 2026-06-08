import {describe, expect, it} from 'vitest';

import {
  isPureChatIntent,
  isReadOnlyPlanningIntent,
  shouldRequireApprovalForAgentAction,
} from '../../src/agent/intentClassifier.js';
import {shouldRequirePlan} from '../../src/agent/planningGate.js';

describe('intent classifier', () => {
  it('treats greetings and capability questions as pure chat', () => {
    for (const prompt of ['hi', 'hello', 'thanks', 'what can you do?', 'who are you']) {
      expect(isPureChatIntent(prompt)).toBe(true);
    }
    expect(isPureChatIntent('delete the build folder')).toBe(false);
  });

  it('treats explanation/planning as read-only intent', () => {
    expect(isReadOnlyPlanningIntent('explain this repo')).toBe(true);
    expect(isReadOnlyPlanningIntent('plan a SaaS app')).toBe(true);
    expect(isReadOnlyPlanningIntent('fix this file')).toBe(false);
    expect(isReadOnlyPlanningIntent('refactor the parser')).toBe(false);
  });

  it('does not require a plan-approval prompt for chat or read-only planning', () => {
    expect(shouldRequirePlan('chat', 'hi')).toBe(false);
    expect(shouldRequirePlan('chat', 'what can you do?')).toBe(false);
    expect(shouldRequirePlan('chat', 'explain this repo')).toBe(false);
    expect(shouldRequirePlan('chat', 'plan a SaaS app')).toBe(false);
  });

  it('still requires a plan for genuine mutating tech tasks', () => {
    expect(shouldRequirePlan('feature', 'implement OAuth login')).toBe(true);
  });

  it('only flags risky agent actions for approval, with a clear reason', () => {
    const read = shouldRequireApprovalForAgentAction({kind: 'read_file', path: 'README.md'});
    expect(read.required).toBe(false);

    const edit = shouldRequireApprovalForAgentAction({kind: 'edit_file', path: 'README.md'});
    expect(edit.required).toBe(true);
    expect(edit.reason).toContain('README.md');

    const shell = shouldRequireApprovalForAgentAction({kind: 'run_command', command: 'npm install'});
    expect(shell.required).toBe(true);
    expect(shell.reason).toContain('npm install');

    const del = shouldRequireApprovalForAgentAction({kind: 'delete_or_move', path: 'node_modules'});
    expect(del.required).toBe(true);
    expect(del.risk).toBe('critical');
  });
});
