import type {ConnectorStatus, GitHubIssue, GitHubPullRequest} from '../types.js';
import {formatApprovalReview} from '../../safety/approvalFormat.js';
import {formatGitHubSetupHint} from './auth.js';

export const formatConnectorStatus = (status: ConnectorStatus): string => [
  `Connector: ${status.name}`,
  `Configured: ${status.configured ? 'yes' : 'no'}`,
  `Detail: ${status.detail}`,
  `Permissions: ${status.permissions.join(', ') || 'none'}`,
  status.configured ? null : formatGitHubSetupHint(),
].filter(Boolean).join('\n');

export const formatGitHubIssueList = (issues: GitHubIssue[]): string => {
  if (issues.length === 0) {
    return 'No open GitHub issues found.';
  }

  return issues.map((issue) => `#${issue.number} ${issue.title} | ${issue.state} | ${issue.labels.join(', ') || 'no labels'}`).join('\n');
};

export const formatGitHubPullList = (pulls: GitHubPullRequest[]): string => {
  if (pulls.length === 0) {
    return 'No open GitHub pull requests found.';
  }

  return pulls.map((pull) => `#${pull.number} ${pull.title} | ${pull.state} | ${pull.head ?? '?'} -> ${pull.base ?? '?'}`).join('\n');
};

export const formatGitHubIssue = (issue: GitHubIssue): string => [
  `#${issue.number} ${issue.title}`,
  `State: ${issue.state}`,
  `Labels: ${issue.labels.join(', ') || 'none'}`,
  issue.htmlUrl ? `URL: ${issue.htmlUrl}` : null,
  '',
  issue.body?.trim() || 'No body.',
].filter(Boolean).join('\n');

export const formatGitHubWritePreview = ({
  body,
  target,
  type,
}: {
  body: string;
  target: string;
  type: 'issue-comment' | 'issue-create' | 'pr-comment' | 'pr-create';
}): string => [
  `GitHub write preview: ${type}`,
  formatApprovalReview({
    action: `GitHub ${type}`,
    preview: body,
    reason: 'Connector write actions can publish content outside the local workspace.',
    riskLevel: type === 'issue-comment' || type === 'pr-comment' ? 'medium' : 'high',
    target,
  }),
  'This action requires approval before posting.',
].join('\n');
