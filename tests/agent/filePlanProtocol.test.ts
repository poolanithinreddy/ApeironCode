import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  formatFilePlanPreview,
  isFilePlanSafe,
  parseFilePlanResponse,
  validateFilePlan,
  type FilePlan,
} from '../../src/agent/filePlanProtocol.js';

const cwd = path.join(os.tmpdir(), 'plan-test');

const validPlan: FilePlan = {
  commands: [],
  files: [{content: '<h1>Hello</h1>', operation: 'create', path: 'index.html'}],
  summary: 'Create hello app',
  validation: ['Open index.html'],
};

describe('filePlanProtocol', () => {
  it('parses valid and fenced JSON plans', () => {
    expect(parseFilePlanResponse(JSON.stringify(validPlan)).ok).toBe(true);
    const fenced = parseFilePlanResponse(`Here:\n\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\``);
    expect(fenced.ok).toBe(true);
  });

  it('returns a clean error for invalid JSON', () => {
    const parsed = parseFilePlanResponse('{bad');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('Invalid file plan JSON');
  });

  it('blocks unsafe paths, missing content, deletes without intent, and secrets', () => {
    expect(validateFilePlan({...validPlan, files: [{content: 'x', operation: 'create', path: '../x'}]}, cwd).ok).toBe(false);
    expect(validateFilePlan({...validPlan, files: [{operation: 'create', path: 'x.html'}]}, cwd).ok).toBe(false);
    expect(validateFilePlan({...validPlan, files: [{operation: 'delete', path: 'app.js'}]}, cwd).ok).toBe(false);
    expect(validateFilePlan({...validPlan, files: [{content: 'API_KEY=abc123456789999', operation: 'create', path: 'x.env'}]}, cwd).ok).toBe(false);
  });

  it('marks commands as requiring command approval', () => {
    const result = validateFilePlan({...validPlan, commands: [{command: 'npm test', reason: 'validate'}]}, cwd);
    expect(result.ok).toBe(true);
    expect(result.requiresCommandApproval).toBe(true);
    expect(formatFilePlanPreview(validPlan)).toContain('index.html');
  });

  it('flags obviously risky plans', () => {
    expect(isFilePlanSafe(validPlan)).toBe(true);
    expect(isFilePlanSafe({...validPlan, commands: [{command: 'rm -rf .', reason: 'bad'}]})).toBe(false);
  });
});
