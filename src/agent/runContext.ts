import type {ResolvedConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {HookRuntime} from '../hooks/runtime.js';
import {ApprovalManager, type ApprovalHandler} from '../safety/approvals.js';
import {AuditLog} from '../safety/auditLog.js';
import {loadExternalTools} from '../tools/external.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolEvent} from '../tools/types.js';
import type {AgentRunOptions} from './types.js';

export const createApprovalManager = (
  config: ResolvedConfig,
  approvalHandler: ApprovalHandler | undefined,
  eventBus?: EventBus,
): ApprovalManager => {
  return new ApprovalManager(
    config.effective.approvalMode,
    approvalHandler,
    config.effective.permissions,
    (event) => {
      eventBus?.emit(event);
    },
  );
};

export const loadConfiguredExternalTools = async ({
  config,
  cwd,
  previousFingerprint,
  toolRegistry,
}: {
  config: ResolvedConfig;
  cwd: string;
  previousFingerprint?: string;
  toolRegistry: ToolRegistry;
}): Promise<string> => {
  const fingerprint = JSON.stringify({
    mcp: config.effective.mcp,
    pluginDirectories: config.effective.plugins.directories,
    pluginDisabled: config.effective.plugins.disabled,
  });

  if (previousFingerprint === fingerprint) {
    return fingerprint;
  }

  toolRegistry.removeBySource(['plugin', 'mcp']);
  await loadExternalTools(toolRegistry, config.effective, cwd);
  return fingerprint;
};

export const configureToolExecutor = ({
  approvalManager,
  config,
  cwd,
  eventBus,
  options,
  sessionAgentSessionId,
  sessionId,
  toolRegistry,
}: {
  approvalManager: ApprovalManager;
  config: ResolvedConfig;
  cwd: string;
  eventBus: EventBus;
  options?: Pick<AgentRunOptions, 'agentSessionId'>;
  sessionAgentSessionId?: string;
  sessionId: string;
  toolRegistry: ToolRegistry;
}): HookRuntime => {
  const hookRuntime = new HookRuntime({
    approvalManager,
    cwd,
    eventBus,
  });
  const auditLog = new AuditLog();

  toolRegistry.configureExecutor({
    approvalManager,
    globalPermissionRules: config.user?.permissions ?? [],
    projectPermissionRules: config.project?.permissions,
    auditLog,
    sessionId,
    agentSessionId: options?.agentSessionId ?? sessionAgentSessionId,
    hookRuntime,
  });

  return hookRuntime;
};

export const createToolOutputEmitter = (eventBus: EventBus) => {
  return (event: ToolEvent): void => {
    eventBus.emit({
      message: event.message,
      outputKind: event.kind,
      timestamp: createEventTimestamp(),
      type: 'tool.output',
    });
  };
};
