import type {McpServerConfig, McpTrustLevel} from './serverConfig.js';

export interface McpPermissionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  risk: McpToolRisk;
}

export type McpToolRisk = 'low' | 'medium' | 'high';

const READ_VERBS = ['list', 'get', 'read', 'search', 'find', 'query', 'fetch', 'inspect', 'describe'];
const WRITE_VERBS = ['create', 'update', 'delete', 'send', 'post', 'comment', 'merge', 'deploy', 'publish', 'write'];
const DESTRUCTIVE_VERBS = ['remove', 'destroy', 'drop', 'execute', 'shell', 'run', 'eval', 'commit', 'push'];

const TRUST_RANK: Record<McpTrustLevel, number> = {
  high: 3,
  low: 1,
  medium: 2,
};

export const isRiskyToolName = (toolName: string): boolean => {
  return classifyMcpToolRisk(toolName) !== 'low';
};

export const classifyMcpToolRisk = (toolName: string): McpToolRisk => {
  const lower = toolName.toLowerCase();
  if (DESTRUCTIVE_VERBS.some((needle) => lower.includes(needle))) {
    return 'high';
  }
  if (WRITE_VERBS.some((needle) => lower.includes(needle))) {
    return 'high';
  }
  if (READ_VERBS.some((needle) => lower.includes(needle))) {
    return 'low';
  }
  return 'medium';
};

export const checkMcpToolPermission = (
  config: McpServerConfig,
  toolName: string,
): McpPermissionDecision => {
  const risk = classifyMcpToolRisk(toolName);
  const requiresApproval = risk !== 'low';
  if (!config.enabled) {
    return {allowed: false, reason: `MCP server ${config.id} is disabled.`, requiresApproval, risk};
  }
  if (config.deniedTools?.includes(toolName)) {
    return {allowed: false, reason: `Tool ${toolName} is in deniedTools for ${config.id}.`, requiresApproval, risk};
  }
  if (config.allowedTools && config.allowedTools.length > 0 && !config.allowedTools.includes(toolName)) {
    return {allowed: false, reason: `Tool ${toolName} is not in allowedTools for ${config.id}.`, requiresApproval, risk};
  }
  if (risk === 'high' && TRUST_RANK[config.trustLevel] < TRUST_RANK.medium) {
    return {
      allowed: false,
      reason: `Tool ${toolName} is risky and ${config.id} has trustLevel "${config.trustLevel}". Set trustLevel to medium or high to allow.`,
      requiresApproval,
      risk,
    };
  }
  return {allowed: true, reason: 'permitted', requiresApproval, risk};
};

export const summarizeMcpPermissions = (config: McpServerConfig): string => {
  const lines = [
    `Server: ${config.id} (${config.name})`,
    `Enabled: ${config.enabled}`,
    `Trust level: ${config.trustLevel}`,
    `Allowed tools: ${config.allowedTools && config.allowedTools.length > 0 ? config.allowedTools.join(', ') : '(all)'}`,
    `Denied tools: ${config.deniedTools && config.deniedTools.length > 0 ? config.deniedTools.join(', ') : '(none)'}`,
  ];
  return lines.join('\n');
};
