import type {ConnectorPermission} from './types.js';

export const requiresApprovalForConnectorWrite = (permission: ConnectorPermission): boolean =>
  permission === 'GitHubComment'
  || permission === 'GitHubPRCreate'
  || permission === 'GitHubWrite'
  || permission === 'JiraWrite'
  || permission === 'LinearWrite'
  || permission === 'SlackWrite';

export const formatConnectorPermission = (permission: ConnectorPermission): string => {
  const risky = requiresApprovalForConnectorWrite(permission) ? 'approval required' : 'read-only';
  return `${permission} (${risky})`;
};
