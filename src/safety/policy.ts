import type {ApprovalMode} from '../config/config.js';

export type ApprovalKind = 'read' | 'write' | 'command' | 'git' | 'secret';
export type ApprovalScope = 'project' | 'external' | 'secret';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalPolicyRequest {
  kind: ApprovalKind;
  scope: ApprovalScope;
  riskLevel: RiskLevel;
}

export const shouldAutoApprove = (
  mode: ApprovalMode,
  request: ApprovalPolicyRequest,
): boolean => {
  if (mode === 'bypass') {
    return true;
  }

  if (mode === 'trusted' || mode === 'trusted-workspace') {
    return (
      request.scope === 'project' &&
      request.kind !== 'command' &&
      request.kind !== 'git' &&
      request.riskLevel !== 'high' &&
      request.riskLevel !== 'critical'
    );
  }

  if (mode === 'auto-read') {
    return request.kind === 'read' && request.scope === 'project' && request.riskLevel === 'low';
  }

  return false;
};