import {describe, expect, it} from 'vitest';

import {evaluatePermissionRules, parsePermissionRule} from '../../src/safety/permissions.js';

describe('permission rules', () => {
  it('parses supported permission rule syntax', () => {
    expect(parsePermissionRule('Bash(npm test)')?.kind).toBe('bash');
    expect(parsePermissionRule('FileEdit(src/**)')?.kind).toBe('file-edit');
    expect(parsePermissionRule('Deny(.env)')?.kind).toBe('deny');
  });

  it('allows and denies matching resources', () => {
    expect(
      evaluatePermissionRules(['Bash(npm test)'], {
        kind: 'command',
        resource: 'npm test',
      }),
    ).toBe('allow');

    expect(
      evaluatePermissionRules(['Deny(.env)'], {
        kind: 'read',
        resource: '.env',
      }),
    ).toBe('deny');
  });
});