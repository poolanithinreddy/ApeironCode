import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {defineTool} from '../../src/tools/types.js';
import {writeFileTool} from '../../src/tools/writeFile.js';
import {createMockConfig} from '../support/mocks.js';

describe('Tool Executor Integration', () => {
  describe('UnifiedToolExecutor with ToolRegistry', () => {
    it('should execute tool with permission checking', async () => {
      // Create a test tool
      const testTool = defineTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: z.object({value: z.string()}),
        requiresApproval: false,
        riskLevel: 'medium',
        run(input) {
          const typedInput = input as {value: string};
          return Promise.resolve({
            ok: true,
            summary: 'Test executed',
            output: `Result: ${typedInput.value}`,
          });
        },
      });

      const registry = new ToolRegistry([testTool]);

      // Create approval manager and audit log
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      // Configure executor
      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: ['Allow(Tool(test_tool))'],
        auditLog,
        sessionId: 'test-session',
      });

      const config = createMockConfig();

      // Execute the tool
      const result = await registry.invoke('test_tool', {value: 'hello'}, {
        cwd: '/test',
        config,
        approvalManager,
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('Result: hello');

      // Verify audit log
      const entries = auditLog.getEntries();
      expect(entries).toHaveLength(2); // Permission decision + execution
      expect(entries[0]!.decision).toBe('allow');
      expect(entries[1]!.decision).toBe('allow');
      expect(entries[1]!.executionStatus).toBe('success');
    });

    it('should deny tool execution with deny rule', async () => {
      const testTool = defineTool({
        name: 'dangerous_tool',
        description: 'A dangerous tool',
        inputSchema: z.object({}),
        requiresApproval: false,
        riskLevel: 'high',
        run() {
          return Promise.resolve({ok: true, summary: 'Executed', output: 'done'});
        },
      });

      const registry = new ToolRegistry([testTool]);
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: ['Deny(Tool(dangerous_tool))'],
        auditLog,
        sessionId: 'test-session',
      });

      const config = createMockConfig();

      // Should throw permission denied error
      await expect(
        registry.invoke('dangerous_tool', {}, {
          cwd: '/test',
          config,
          approvalManager,
        }),
      ).rejects.toThrow(/Tool execution denied by permission rule/);

      const entries = auditLog.getEntries();
      expect(entries.some((e) => e.decision === 'deny')).toBe(true);
    });

    it('should handle wildcard tool patterns', async () => {
      const tool1 = defineTool({
        name: 'plugin:mylib.echo',
        description: 'Echo tool from plugin',
        inputSchema: z.object({text: z.string()}),
        requiresApproval: false,
        riskLevel: 'low',
        run(input) {
          const typedInput = input as {text: string};
          return Promise.resolve({ok: true, summary: 'Echoed', output: typedInput.text});
        },
      });

      const tool2 = defineTool({
        name: 'plugin:mylib.reverse',
        description: 'Reverse tool from plugin',
        inputSchema: z.object({text: z.string()}),
        requiresApproval: false,
        riskLevel: 'low',
        run(input) {
          const typedInput = input as {text: string};
          return Promise.resolve({ok: true, summary: 'Reversed', output: typedInput.text.split('').reverse().join('')});
        },
      });

      const registry = new ToolRegistry([tool1, tool2]);
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      // Use wildcard pattern to allow all tools from mylib plugin
      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: ['Allow(Tool(plugin:mylib.*))'],
        auditLog,
        sessionId: 'test-session',
      });

      const config = createMockConfig();

      // Both tools should be allowed
      const result1 = await registry.invoke('plugin:mylib.echo', {text: 'hello'}, {
        cwd: '/test',
        config,
        approvalManager,
      });
      expect(result1.output).toBe('hello');

      const result2 = await registry.invoke('plugin:mylib.reverse', {text: 'hello'}, {
        cwd: '/test',
        config,
        approvalManager,
      });
      expect(result2.output).toBe('olleh');

      const entries = auditLog.getEntries();
      expect(entries.filter((e) => e.decision === 'allow')).toHaveLength(4); // 2 permission + 2 execution
    });

    it('should record audit trail for all executions', async () => {
      const testTool = defineTool({
        name: 'audit_test',
        description: 'For audit testing',
        inputSchema: z.object({}),
        requiresApproval: false,
        riskLevel: 'medium',
        run() {
          return Promise.resolve({ok: true, summary: 'Done', output: 'success'});
        },
      });

      const registry = new ToolRegistry([testTool]);
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: ['Allow(Tool(audit_test))'],
        auditLog,
        sessionId: 'audit-session-123',
      });

      const config = createMockConfig();

      await registry.invoke('audit_test', {}, {
        cwd: '/test',
        config,
        approvalManager,
      });

      const entries = auditLog.getEntries();
      expect(entries).toHaveLength(2);

      // First entry: permission decision
      expect(entries[0]).toMatchObject({
        sessionId: 'audit-session-123',
        actionType: 'Tool',
        resource: 'audit_test',
        decision: 'allow',
        toolIdentity: 'audit_test',
      });

      // Second entry: execution
      expect(entries[1]).toMatchObject({
        sessionId: 'audit-session-123',
        actionType: 'Tool',
        resource: 'audit_test',
        decision: 'allow',
        executionStatus: 'success',
        toolIdentity: 'audit_test',
      });

      expect(entries[1]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should allow tool execution without executor configured', async () => {
      const testTool = defineTool({
        name: 'plain_tool',
        description: 'A plain tool',
        inputSchema: z.object({value: z.string()}),
        requiresApproval: false,
        riskLevel: 'low',
        run(input) {
          const typedInput = input as {value: string};
          return Promise.resolve({ok: true, summary: 'Executed', output: typedInput.value});
        },
      });

      const registry = new ToolRegistry([testTool]);
      const approvalManager = new ApprovalManager('bypass');

      const config = createMockConfig();

      // Don't configure executor - should still work but without permission checking
      const result = await registry.invoke('plain_tool', {value: 'test'}, {
        cwd: '/test',
        config,
        approvalManager,
      });

      expect(result.ok).toBe(true);
      expect(result.output).toBe('test');
    });

    it('reports missing write_file path/content with a clean message', async () => {
      const approvalManager = new ApprovalManager('bypass');
      const registry = new ToolRegistry([writeFileTool]);
      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: [],
        auditLog: new AuditLog(),
        sessionId: 'write-file-schema',
      });
      await expect(
        registry.invoke('write_file', {}, {
          cwd: '/test',
          config: createMockConfig(),
          approvalManager,
        }),
      ).rejects.toThrow('write_file requires path and content');
    });
  });
});
