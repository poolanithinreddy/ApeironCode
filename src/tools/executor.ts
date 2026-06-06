import crypto from 'node:crypto';

import type {ApprovalManager} from '../safety/approvals.js';
import type {AuditLog} from '../safety/auditLog.js';
import type {PermissionRule} from '../safety/permissionParser.js';
import {parsePermissionRules} from '../safety/permissionParser.js';
import {evaluatePermissionRules} from '../safety/permissionMatcher.js';
import {AppError} from '../utils/errors.js';
import {
  formatToolInputError,
  normalizeToolCall,
  validateToolInput,
} from '../agent/toolExecutionContract.js';
import {zodToJsonSchema} from './schema.js';
import type {ToolExecutionContext, ToolResult} from './types.js';
import type {ToolRegistry} from './registry.js';

const parseMcpIdentity = (toolName: string): {serverName: string; toolName: string} | null => {
  const match = toolName.match(/^mcp:([^.]+)\.(.+)$/u);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    serverName: match[1],
    toolName: match[2],
  };
};

const summarizeInput = (input: unknown): string | undefined => {
  if (input === null || input === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(input, (key: string, value: unknown): unknown => {
      if (/token|secret|password|api[_-]?key/iu.test(key)) {
        return '[redacted]';
      }
      return value;
    });
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return undefined;
  }
};

export interface ToolExecutionOptions {
  approvalManager: ApprovalManager;
  globalPermissionRules: string[];
  projectPermissionRules?: string[];
  sessionPermissionRules?: string[];
  auditLog: AuditLog;
  sessionId?: string;
  agentSessionId?: string;
}

export class UnifiedToolExecutor {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly options: ToolExecutionOptions,
  ) {}

  async execute(toolName: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const mcpIdentity = parseMcpIdentity(toolName);
    const inputSummary = summarizeInput(input);

    try {
      const tool = this.toolRegistry.get(toolName);
      const riskLevel = tool.riskLevel || 'high';

      // Check planning gate for risky tools
      const riskyToolNames = ['edit_file', 'write_file', 'patch_file', 'run_command', 'git_commit', 'revert_patch', 'delete_file'];
      const isRiskyTool = riskyToolNames.includes(toolName) || riskLevel === 'critical' || (riskLevel === 'high' && mcpIdentity?.serverName);

      if (isRiskyTool && context.planningRequired && !context.executingPlanId) {
        const summary = `Planning approval required before running: ${toolName}`;
        this.options.auditLog.record({
          timestamp: new Date().toISOString(),
          sessionId: this.options.sessionId,
          requestId,
          actionType: 'Tool',
          resource: toolName,
          toolIdentity: toolName,
          decision: 'rejected',
          source: 'default',
          riskLevel,
          durationMs: Date.now() - startTime,
          inputSummary,
          mcpServerName: mcpIdentity?.serverName,
          mcpToolName: mcpIdentity?.toolName,
        });
        return {
          ok: false,
          output: '',
          summary,
        };
      }

      // Parse all permission rules
      const allRules = [
        ...parsePermissionRules(this.options.globalPermissionRules).valid,
        ...(this.options.projectPermissionRules
          ? parsePermissionRules(this.options.projectPermissionRules).valid
          : []),
        ...(this.options.sessionPermissionRules
          ? parsePermissionRules(this.options.sessionPermissionRules).valid
          : []),
      ];

      // Evaluate permissions
      const ruleEval = evaluatePermissionRules(allRules, {
        actionType: 'Tool',
        resource: toolName,
      });
      const matchedRule = ruleEval.matchedRule;
      // When no explicit allow/deny rule matched, the rule engine returns
      // "ask" for everything. Defer to the tool's own intrinsic policy so
      // read-only/safe tools (project_tree, read_file, search, list, context
      // preview, doctor/status, etc.) run without an approval prompt. Tools
      // that declare requiresApproval (edit/write/delete/run/git/github/mcp
      // writes) still prompt. Explicit allow/deny rules always win.
      let decision = ruleEval.decision;
      if (decision === 'ask' && !matchedRule && tool.requiresApproval === false) {
        decision = 'allow';
      }

      const durationMs = Date.now() - startTime;

      // Record audit entry for permission decision
      this.options.auditLog.record({
        timestamp: new Date().toISOString(),
        sessionId: this.options.sessionId,
        requestId,
        actionType: 'Tool',
        resource: toolName,
        toolIdentity: toolName,
        decision: decision as 'allow' | 'deny' | 'approved' | 'rejected',
        matchedRule,
        source: this.getRuleSource(matchedRule),
        riskLevel,
        durationMs,
        inputSummary,
        mcpServerName: mcpIdentity?.serverName,
        mcpToolName: mcpIdentity?.toolName,
      });

      if (decision === 'deny') {
        throw new AppError(`Tool execution denied by permission rule: ${toolName}`, 'PERMISSION_DENIED');
      }

      const networkTargets = tool.networkTargets?.(input, context) ?? [];
      for (const [index, target] of networkTargets.entries()) {
        const networkDecision = evaluatePermissionRules(allRules, {
          actionType: 'Network',
          resource: target,
        });

        if (networkDecision.decision === 'deny') {
          this.options.auditLog.record({
            timestamp: new Date().toISOString(),
            sessionId: this.options.sessionId,
            requestId: `${requestId}:network:${index}`,
            actionType: 'Network',
            resource: target,
            decision: 'deny',
            matchedRule: networkDecision.matchedRule,
            source: this.getRuleSource(networkDecision.matchedRule),
            riskLevel,
            inputSummary,
          });
          throw new AppError(`Network access denied by permission rule: ${target}`, 'PERMISSION_DENIED');
        }

        if (networkDecision.decision === 'ask') {
          const approval = await this.options.approvalManager.request({
            details: `Tool: ${toolName}`,
            kind: 'command',
            message: `Allow network access to ${target}?`,
            riskLevel,
            scope: 'external',
            title: `Network access for ${toolName}`,
          });

          this.options.auditLog.record({
            timestamp: new Date().toISOString(),
            sessionId: this.options.sessionId,
            requestId: `${requestId}:network:${index}`,
            actionType: 'Network',
            resource: target,
            decision: approval.approved ? 'approved' : 'rejected',
            matchedRule: networkDecision.matchedRule,
            source: this.getRuleSource(networkDecision.matchedRule),
            riskLevel,
            userApproved: approval.approved,
            inputSummary,
          });

          if (!approval.approved) {
            throw new AppError(`Network access rejected by user: ${target}`, 'APPROVAL_DENIED');
          }
          continue;
        }

        this.options.auditLog.record({
          timestamp: new Date().toISOString(),
          sessionId: this.options.sessionId,
          requestId: `${requestId}:network:${index}`,
          actionType: 'Network',
          resource: target,
          decision: 'allow',
          matchedRule: networkDecision.matchedRule,
          source: this.getRuleSource(networkDecision.matchedRule),
          riskLevel,
          inputSummary,
        });
      }

      const preapproved = context.preapprovedTools?.includes(toolName) === true;
      // Request approval if needed
      if (decision === 'ask' && !preapproved) {
        const approval = await this.options.approvalManager.request({
          kind: 'command',
          scope: 'external',
          title: `Execute Tool: ${toolName}`,
          message: `Execute ${tool.displayName || toolName}?`,
          riskLevel,
          resource: toolName,
        });

        if (!approval.approved) {
          throw new AppError(`Tool execution rejected by user: ${toolName}`, 'APPROVAL_DENIED');
        }
      }

      // Check file locks if running under an agent session
      let lockedFilePaths: string[] = [];
      if (this.options.agentSessionId) {
        const lockCheckResult = await this.checkAndAcquireFileLocks(
          toolName,
          input,
          context.cwd,
          this.options.agentSessionId,
        );
        if (!lockCheckResult.ok) {
          return lockCheckResult.result!;
        }
        lockedFilePaths = lockCheckResult.lockedFilePaths;
      }

      // Execute tool directly (bypass registry.invoke to avoid circular calls).
      // Every tool passes through the central execution contract so undefined
      // args never reach a tool and a failure for one tool can never surface
      // another tool's error message.
      const {input: normalizedInput} = normalizeToolCall(toolName, input);
      const schemaRequired = zodToJsonSchema(tool.inputSchema).required ?? [];
      const contractError = validateToolInput(toolName, normalizedInput, schemaRequired);
      if (contractError) {
        throw new AppError(formatToolInputError(contractError), 'TOOL_INPUT_INVALID');
      }
      const toolToExecute = this.toolRegistry.get(toolName);
      const result = await toolToExecute.run(normalizedInput, context);

      // Record successful execution
      const executionDurationMs = Date.now() - startTime;
      this.options.auditLog.record({
        timestamp: new Date().toISOString(),
        sessionId: this.options.sessionId,
        requestId,
        actionType: 'Tool',
        resource: toolName,
        toolIdentity: toolName,
        decision: decision === 'ask' ? 'approved' : 'allow',
        matchedRule,
        source: this.getRuleSource(matchedRule),
        riskLevel,
        userApproved: decision === 'ask',
        executionStatus: result.ok ? 'success' : 'error',
        durationMs: executionDurationMs,
        inputSummary,
        mcpServerName: mcpIdentity?.serverName,
        mcpToolName: mcpIdentity?.toolName,
      });

      // Track tool execution in agent session if running under one
      if (this.options.agentSessionId && result.ok) {
        await this.recordToolExecutionInSession(toolName, result, context.cwd, lockedFilePaths);
      }

      // Add permission metadata to result for UI display
      return {
        ...result,
        metadata: {
          ...result.metadata,
          permissionDecision: decision === 'ask' ? 'approved' : 'allow',
          riskLevel: result.metadata?.riskLevel ?? riskLevel,
          matchedRule: matchedRule?.raw,
          durationMs: executionDurationMs,
        },
      };
    } catch (err) {
      const executionDurationMs = Date.now() - startTime;
      const tool = this.toolRegistry.get(toolName);
      const riskLevel = tool.riskLevel || 'high';

      const errorMessage = err instanceof AppError ? err.message : String(err);

      // Record failure
      this.options.auditLog.record({
        timestamp: new Date().toISOString(),
        sessionId: this.options.sessionId,
        requestId,
        actionType: 'Tool',
        resource: toolName,
        toolIdentity: toolName,
        decision: errorMessage.includes('denied') ? 'deny' : 'rejected',
        source: 'session',
        riskLevel,
        executionStatus: 'error',
        errorMessage,
        durationMs: executionDurationMs,
        inputSummary,
        mcpServerName: mcpIdentity?.serverName,
        mcpToolName: mcpIdentity?.toolName,
      });

      throw err;
    }
  }

  private getRuleSource(rule: PermissionRule | null): 'global' | 'project' | 'session' | 'default' {
    if (!rule) return 'default';

    const globalRules = parsePermissionRules(this.options.globalPermissionRules).valid;
    if (globalRules.some((r) => r.raw === rule.raw)) return 'global';

    const projectRules = this.options.projectPermissionRules
      ? parsePermissionRules(this.options.projectPermissionRules).valid
      : [];
    if (projectRules.some((r) => r.raw === rule.raw)) return 'project';

    return 'session';
  }

  private async checkAndAcquireFileLocks(
    toolName: string,
    input: unknown,
    cwd: string,
    agentSessionId: string,
  ): Promise<{ok: boolean; result: ToolResult | null; lockedFilePaths: string[]}> {
    try {
      const {MultiAgentSessionManager} = await import('../multisession/manager.js');
      const {extractToolLockTargets, formatLockConflictMessage} = await import('../multisession/toolLocks.js');

      const sessionManager = new MultiAgentSessionManager(cwd);
      const targets = extractToolLockTargets(toolName, input as Record<string, unknown>, cwd);

      if (!targets.shouldLock) {
        return {ok: true, result: null, lockedFilePaths: []};
      }

      // Check for conflicts on target files
      const lockedFilePaths: string[] = [];
      for (const filePath of targets.filePaths) {
        const conflict = await sessionManager.checkFileConflict(filePath, agentSessionId);
        if (conflict) {
          const session = await sessionManager.getSession(conflict.sessionId);
          const sessionStatus = session?.status ?? 'unknown';
          const sessionGoal = session?.goal ?? 'unknown goal';

          const conflictMessage = formatLockConflictMessage(filePath, conflict.sessionId, sessionGoal, sessionStatus);

          return {
            ok: false,
            result: {
              ok: false,
              output: conflictMessage,
              summary: `File lock conflict: ${filePath} is locked by session ${conflict.sessionId}`,
              metadata: {
                lockConflict: true,
                filePath,
                blockingSessionId: conflict.sessionId,
                blockingSessionGoal: sessionGoal,
                blockingSessionStatus: sessionStatus,
              },
            },
            lockedFilePaths: [],
          };
        }

        // Try to acquire lock
        const acquired = await sessionManager.acquireFileLock(filePath, agentSessionId, 'Tool execution lock');
        if (acquired) {
          lockedFilePaths.push(filePath);
        }
      }

      return {ok: true, result: null, lockedFilePaths};
    } catch {
      // If lock checking fails, allow tool to proceed (fail open)
      return {ok: true, result: null, lockedFilePaths: []};
    }
  }

  private async recordToolExecutionInSession(
    toolName: string,
    result: ToolResult,
    cwd: string,
    lockedFilePaths: string[] = [],
  ): Promise<void> {
    try {
      const {MultiAgentSessionManager} = await import('../multisession/manager.js');
      const sessionManager = new MultiAgentSessionManager(cwd);

      const updates: {filesChanged?: string[]; commandsRun?: string[]; testsRun?: string[]; filesLocked?: string[]} = {};

      const fileModifyingTools = ['edit_file', 'write_file', 'patch_file', 'revert_patch'];
      if (fileModifyingTools.includes(toolName) && typeof result.metadata?.filePath === 'string') {
        updates.filesChanged = [result.metadata.filePath];
      }

      const commandRunningTools = ['run_command', 'git_commit'];
      if (commandRunningTools.includes(toolName)) {
        if (typeof result.metadata?.command === 'string') {
          updates.commandsRun = [result.metadata.command];
        } else {
          updates.commandsRun = [toolName];
        }
      }

      const testRunningTools = ['test_runner', 'lint_runner', 'build_runner'];
      if (testRunningTools.includes(toolName)) {
        updates.testsRun = [toolName];
      }

      if (lockedFilePaths.length > 0) {
        updates.filesLocked = lockedFilePaths;
      }

      if (Object.keys(updates).length > 0) {
        await sessionManager.updateSession(this.options.agentSessionId!, updates);
      }
    } catch {
      // Fail silently if session tracking fails
    }
  }
}
