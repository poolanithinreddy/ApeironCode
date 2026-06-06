import {redactSecretLikeContent} from '../memory/safety.js';
import type {RiskLevel} from '../safety/policy.js';
import type {ActionCategory, PermissionMode} from '../safety/permissionModes.js';
import {getPermissionDecision} from '../safety/permissionModes.js';

export type RuntimeActionKind =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'run_command'
  | 'connector_write'
  | 'github_write'
  | 'mcp_write'
  | 'delete_or_move'
  | 'unknown';

export interface RuntimeAction {
  command?: string;
  kind: RuntimeActionKind;
  path?: string;
  toolName?: string;
}

export interface RuntimePermissionContext {
  approvalMode?: string;
  explicitlyAllowed?: boolean;
  permissionMode?: PermissionMode;
}

const ACTION_CATEGORY_MAP: Record<RuntimeActionKind, ActionCategory> = {
  read_file: 'read-file',
  write_file: 'write-file',
  edit_file: 'edit-file',
  run_command: 'run-shell',
  connector_write: 'connector-write',
  github_write: 'github-write',
  mcp_write: 'mcp-write',
  delete_or_move: 'delete-file',
  unknown: 'run-shell',
};

export const resolveRuntimePermissionDecision = (
  action: RuntimeAction,
  context: RuntimePermissionContext = {},
): 'allow' | 'ask' | 'deny' => {
  if (context.explicitlyAllowed || context.approvalMode === 'bypass') return 'allow';
  const mode: PermissionMode = context.permissionMode ?? 'default';
  return getPermissionDecision(mode, ACTION_CATEGORY_MAP[action.kind]);
};

export interface RuntimeApprovalDecision {
  approved: boolean;
  reason: string;
  risk: RiskLevel;
}

const PACKAGE_OR_CONFIG_RE = /(^|\/)(package\.json|.*lock.*|tsconfig\.json|[^/]+\.config\.[jt]s)$/u;

export const classifyRuntimeActionRisk = (action: RuntimeAction): RiskLevel => {
  const pathText = action.path ?? '';
  if (action.kind === 'delete_or_move') return 'critical';
  if (/\b(rm\s+-rf|git\s+reset\s+--hard|npm\s+publish)\b/u.test(action.command ?? '')) return 'critical';
  if (action.kind === 'run_command' || action.kind.endsWith('_write')) return 'high';
  if ((action.kind === 'write_file' || action.kind === 'edit_file') && PACKAGE_OR_CONFIG_RE.test(pathText)) return 'high';
  if (action.kind === 'write_file' || action.kind === 'edit_file') return 'medium';
  if (action.kind === 'read_file') return 'low';
  return 'medium';
};

export const requiresRuntimeApproval = (
  action: RuntimeAction,
  context: RuntimePermissionContext = {},
): boolean => {
  if (context.explicitlyAllowed || context.approvalMode === 'bypass') return false;
  const risk = classifyRuntimeActionRisk(action);
  if (action.kind === 'read_file' && risk === 'low') return false;
  return risk === 'medium' || risk === 'high' || risk === 'critical';
};

export const formatApprovalRequest = (action: RuntimeAction): string => {
  const risk = classifyRuntimeActionRisk(action);
  return redactSecretLikeContent([
    `Runtime approval required (${risk})`,
    action.toolName ? `Tool: ${action.toolName}` : '',
    action.path ? `Path: ${action.path}` : '',
    action.command ? `Command: ${action.command}` : '',
  ].filter(Boolean).join('\n'));
};

export const recordApprovalDecision = (decision: RuntimeApprovalDecision): RuntimeApprovalDecision => ({
  ...decision,
  reason: redactSecretLikeContent(decision.reason),
});
