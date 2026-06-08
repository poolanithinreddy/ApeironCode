import {describe, expect, it} from 'vitest';

import {
  evaluatePermissionRules,
  formatPermissionDecision,
  isDangerouslyBroadRule,
  parsePermissionRule,
} from '../../src/safety/permissionRules.js';

describe('permissionRules', () => {
  it('allow rule matches and returns allow', () => {
    const rule = parsePermissionRule('allow:tool(edit_file)');
    const result = evaluatePermissionRules({toolName: 'edit_file'}, [rule]);
    expect(result.decision).toBe('allow');
  });

  it('deny rule matches and returns deny', () => {
    const rule = parsePermissionRule('deny:command(rm)');
    const result = evaluatePermissionRules({command: 'rm -rf /'}, [rule]);
    expect(result.decision).toBe('deny');
  });

  it('ask rule matches and returns ask', () => {
    const rule = parsePermissionRule('ask:path(src/**)');
    const result = evaluatePermissionRules({path: 'src/foo/bar.ts'}, [rule]);
    expect(result.decision).toBe('ask');
  });

  it('path glob matches', () => {
    const rule = parsePermissionRule('allow:path(src/**)');
    expect(evaluatePermissionRules({path: 'src/a/b.ts'}, [rule]).decision).toBe('allow');
    expect(evaluatePermissionRules({path: 'tests/a.ts'}, [rule]).decision).toBe('ask');
  });

  it('risk category matches', () => {
    const rule = parsePermissionRule('allow:risk(readonly)');
    expect(evaluatePermissionRules({riskCategory: 'readonly'}, [rule]).decision).toBe('allow');
  });

  it('deny takes priority over allow', () => {
    const allow = parsePermissionRule('allow:command(npm)');
    const deny = parsePermissionRule('deny:command(npm)');
    const result = evaluatePermissionRules({command: 'npm install'}, [allow, deny]);
    expect(result.decision).toBe('deny');
  });

  it('flags dangerously broad rules', () => {
    expect(isDangerouslyBroadRule(parsePermissionRule('allow:command(*)'))).toBe(true);
    expect(isDangerouslyBroadRule(parsePermissionRule('allow:risk(*)'))).toBe(true);
    expect(isDangerouslyBroadRule(parsePermissionRule('allow:tool(read_file)'))).toBe(false);
  });

  it('formatPermissionDecision contains no long secret blobs', () => {
    const rule = parsePermissionRule('allow:command(npm)');
    const result = evaluatePermissionRules({command: 'npm install'}, [rule]);
    const text = formatPermissionDecision(result);
    expect(text).toContain('decision');
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}/u);
  });
});
