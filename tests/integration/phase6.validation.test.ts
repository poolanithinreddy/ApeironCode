import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {parsePermissionRules} from '../../src/safety/permissionParser.js';
import {evaluatePermissionRules} from '../../src/safety/permissionMatcher.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {defineTool} from '../../src/tools/types.js';
import {createMockConfig} from '../support/mocks.js';

describe('Phase 6: Validation Gates', () => {
  describe('End-to-end permission system validation', () => {
    it('should validate complete permission workflow', async () => {
      // Create tools representing different sources
      const builtinTool = defineTool({
        name: 'read_file',
        description: 'Read a file',
        inputSchema: z.object({path: z.string()}),
        requiresApproval: false,
        riskLevel: 'low',
        run() {
          return Promise.resolve({ok: true, summary: 'File read', output: 'content'});
        },
      });

      const pluginTool = defineTool({
        name: 'plugin:custom-lib.analyze',
        description: 'Analyze with custom plugin',
        inputSchema: z.object({data: z.unknown()}),
        requiresApproval: false,
        riskLevel: 'high',
        run() {
          return Promise.resolve({ok: true, summary: 'Analysis done', output: 'results'});
        },
      });

      const mcpTool = defineTool({
        name: 'mcp:server.query',
        description: 'Query MCP server',
        inputSchema: z.object({query: z.string()}),
        requiresApproval: false,
        riskLevel: 'high',
        run() {
          return Promise.resolve({ok: true, summary: 'Query executed', output: 'data'});
        },
      });

      const registry = new ToolRegistry([builtinTool, pluginTool, mcpTool]);
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      // Configure with comprehensive permission rules
      const rules = [
        'Allow(Tool(read_file))',
        'Allow(Tool(plugin:custom-lib.*))',
        'Deny(Tool(mcp:server.*))',
      ];

      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: rules,
        auditLog,
        sessionId: 'phase6-validation',
      });

      const config = createMockConfig();

      // Test 1: Builtin tool should be allowed
      const result1 = await registry.invoke('read_file', {path: '/test.txt'}, {
        cwd: '/test',
        config,
        approvalManager,
      });
      expect(result1.ok).toBe(true);

      // Test 2: Plugin tool should be allowed (matches wildcard)
      const result2 = await registry.invoke('plugin:custom-lib.analyze', {data: 'test'}, {
        cwd: '/test',
        config,
        approvalManager,
      });
      expect(result2.ok).toBe(true);

      // Test 3: MCP tool should be denied
      await expect(
        registry.invoke('mcp:server.query', {query: 'test'}, {
          cwd: '/test',
          config,
          approvalManager,
        }),
      ).rejects.toThrow(/Tool execution denied by permission rule/);

      // Verify audit log has all entries
      const entries = auditLog.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(5); // At least 2 permission checks + 2 executions + 1 denial

      // Check that we have allow, allow, and deny decisions
      const decisions = entries.map((e) => e.decision);
      expect(decisions).toContain('allow');
      expect(decisions).toContain('deny');

      // Verify session ID is tracked
      expect(entries.every((e) => e.sessionId === 'phase6-validation')).toBe(true);
    });

    it('should validate permission rule parsing for all action types', () => {
      const ruleStrings = [
        'Allow(FileRead(src/**))',
        'Deny(FileEdit(*.env))',
        'Allow(FileWrite(.gitignore))',
        'Allow(Bash(npm test))',
        'Deny(Bash(rm -rf **))',
        'Allow(Tool(plugin:safe.*))',
        'Deny(Tool(mcp:dangerous.*))',
        'Allow(Network(https://api.github.com/**))',
        'Deny(Network(*.internal))',
      ];

      const {valid, errors} = parsePermissionRules(ruleStrings);

      // All rules should parse successfully
      expect(valid).toHaveLength(ruleStrings.length);
      expect(errors).toHaveLength(0);

      // Verify each rule has correct properties
      expect(valid).toHaveLength(9);
      expect(valid[0]!.effect).toBe('Allow');
      expect(valid[0]!.actionType).toBe('FileRead');
      expect(valid[1]!.effect).toBe('Deny');
      expect(valid[1]!.actionType).toBe('FileEdit');
      expect(valid[4]!.effect).toBe('Deny');
      expect(valid[4]!.actionType).toBe('Bash');
      expect(valid[6]!.effect).toBe('Deny');
      expect(valid[6]!.actionType).toBe('Tool');
    });

    it('should validate permission matching for common patterns', () => {
      const {valid: rules} = parsePermissionRules([
        'Allow(FileRead(src/**))',
        'Allow(Tool(plugin:logger.*))',
        'Deny(Network(*.internal))',
        'Allow(Bash(npm *))',
      ]);

      // Test FileRead pattern matching
      let result = evaluatePermissionRules(rules, {
        actionType: 'FileRead',
        resource: 'src/components/Button.tsx',
      });
      expect(result.decision).toBe('allow');

      // Test Plugin tool wildcard
      result = evaluatePermissionRules(rules, {
        actionType: 'Tool',
        resource: 'plugin:logger.debug',
      });
      expect(result.decision).toBe('allow');

      // Test Network domain pattern
      result = evaluatePermissionRules(rules, {
        actionType: 'Network',
        resource: 'api.internal',
      });
      expect(result.decision).toBe('deny');

      // Test Bash command prefix
      result = evaluatePermissionRules(rules, {
        actionType: 'Bash',
        resource: 'npm install @types/node',
      });
      expect(result.decision).toBe('allow');
    });

    it('should validate deny precedence', () => {
      const {valid: rules} = parsePermissionRules([
        'Allow(Tool(plugin:test.*))',
        'Deny(Tool(plugin:test.dangerous))',
      ]);

      // Safe tool should be allowed
      let result = evaluatePermissionRules(rules, {
        actionType: 'Tool',
        resource: 'plugin:test.safe',
      });
      expect(result.decision).toBe('allow');

      // Dangerous tool should be denied (deny takes precedence)
      result = evaluatePermissionRules(rules, {
        actionType: 'Tool',
        resource: 'plugin:test.dangerous',
      });
      expect(result.decision).toBe('deny');
      expect(result.matchedRule?.effect).toBe('Deny');
    });

    it('should validate audit log captures all tool execution metadata', async () => {
      const tool = defineTool({
        name: 'audit_validation_tool',
        description: 'Tool for audit validation',
        inputSchema: z.object({}),
        requiresApproval: false,
        riskLevel: 'high',
        run() {
          return Promise.resolve({
            ok: true,
            summary: 'Execution complete',
            output: 'data',
            metadata: {source: 'test'},
          });
        },
      });

      const registry = new ToolRegistry([tool]);
      const approvalManager = new ApprovalManager('bypass');
      const auditLog = new AuditLog();

      registry.configureExecutor({
        approvalManager,
        globalPermissionRules: ['Allow(Tool(audit_validation_tool))'],
        auditLog,
        sessionId: 'audit-session',
      });

      const config = createMockConfig();
      const startTime = Date.now();

      await registry.invoke('audit_validation_tool', {}, {
        cwd: '/test',
        config,
        approvalManager,
      });

      const entries = auditLog.getEntries();
      const executionEntry = entries.find((e) => e.executionStatus === 'success');

      expect(executionEntry).toBeDefined();
      expect(executionEntry?.sessionId).toBe('audit-session');
      expect(executionEntry?.toolIdentity).toBe('audit_validation_tool');
      expect(executionEntry?.actionType).toBe('Tool');
      expect(executionEntry?.riskLevel).toBe('high');
      expect(executionEntry?.durationMs).toBeGreaterThanOrEqual(0);

      // Verify timestamp is reasonable
      const entryTime = new Date(executionEntry!.timestamp).getTime();
      expect(entryTime).toBeGreaterThanOrEqual(startTime - 1000); // Allow 1s buffer
    });

    it('should validate tool registry supports all tool sources', () => {
      const tools = [
        defineTool({
          name: 'builtin_tool',
          description: 'Built-in',
          inputSchema: z.object({}),
          requiresApproval: false,
          riskLevel: 'low',
          run() {
            return Promise.resolve({ok: true, summary: 'done', output: ''});
          },
        }),
        defineTool({
          name: 'plugin:custom.tool',
          description: 'Plugin',
          inputSchema: z.object({}),
          requiresApproval: false,
          riskLevel: 'high',
          run() {
            return Promise.resolve({ok: true, summary: 'done', output: ''});
          },
        }),
        defineTool({
          name: 'mcp:server.tool',
          description: 'MCP',
          inputSchema: z.object({}),
          requiresApproval: false,
          riskLevel: 'high',
          run() {
            return Promise.resolve({ok: true, summary: 'done', output: ''});
          },
        }),
      ];

      const registry = new ToolRegistry(tools);

      // All tools should be retrievable
      expect(registry.get('builtin_tool')).toBeDefined();
      expect(registry.get('plugin:custom.tool')).toBeDefined();
      expect(registry.get('mcp:server.tool')).toBeDefined();

      // List should contain all tools
      const allTools = registry.list();
      expect(allTools).toHaveLength(3);
    });

    it('should validate permission rules handle special characters', () => {
      const {valid: rules} = parsePermissionRules([
        'Allow(FileRead(src/**\\.{ts,tsx}))',
        'Deny(Bash(rm -rf /\\ *))',
        'Allow(Network(https://.*\\.github\\.com/**))',
      ]);

      // All rules should parse despite special characters
      expect(rules).toHaveLength(3);
      expect(rules[0]!.pattern).toContain('.');
      expect(rules[1]!.pattern).toContain('-rf');
    });

    it('should validate error handling for invalid rules', () => {
      const {valid, errors} = parsePermissionRules([
        'Valid(Tool(test.tool))',
        'Allow(Tool(test))',
        'Unknown(Network(example.com))',
        'Deny(Bash(npm test))',
      ]);

      // Should have 2 valid rules and 2 errors
      expect(valid).toHaveLength(2);
      expect(errors).toHaveLength(2);
      expect(errors[0]!.raw).toBe('Valid(Tool(test.tool))');
      expect(errors[1]!.raw).toBe('Unknown(Network(example.com))');
    });
  });
});
