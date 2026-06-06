import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {ApprovalManager} from '../../src/safety/approvals.js';
import type {ApprovalRequest} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {defineTool} from '../../src/tools/types.js';
import {createMockConfig} from '../support/mocks.js';

const makeTool = (name: string, requiresApproval: boolean) =>
  defineTool({
    name,
    description: `${name} test tool`,
    inputSchema: z.object({}),
    requiresApproval,
    riskLevel: requiresApproval ? 'high' : 'low',
    run() {
      return Promise.resolve({ok: true, summary: 'ran', output: 'ok'});
    },
  });

const run = async (name: string, requiresApproval: boolean) => {
  const registry = new ToolRegistry([makeTool(name, requiresApproval)]);
  const prompts: ApprovalRequest[] = [];
  const approvalManager = new ApprovalManager('ask', (request) => {
    prompts.push(request);
    return Promise.resolve({approved: true});
  });
  const auditLog = new AuditLog();
  registry.configureExecutor({
    approvalManager,
    // No explicit permission rules: the rule engine returns "ask" for
    // everything, so the tool's intrinsic requiresApproval must decide.
    globalPermissionRules: [],
    auditLog,
    sessionId: 'test-session',
  });
  const result = await registry.invoke(name, {}, {
    cwd: '/test',
    config: createMockConfig(),
    approvalManager,
  });
  return {prompts, result};
};

describe('executor intrinsic approval policy (no explicit rules)', () => {
  it('runs a read-only tool without an approval prompt', async () => {
    const {prompts, result} = await run('project_tree', false);
    expect(result.ok).toBe(true);
    expect(prompts).toHaveLength(0);
  });

  it('still prompts for a tool that declares requiresApproval', async () => {
    const {prompts, result} = await run('edit_file', true);
    expect(result.ok).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.title).toContain('edit_file');
  });
});
