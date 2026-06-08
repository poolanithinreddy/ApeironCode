export type AutomationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface AutomationOptions {
  approvalRequired?: boolean;
  dryRun?: boolean;
  maxIterations?: number;
  runTests?: boolean;
}

export interface AutomationStep {
  detail?: string;
  name: string;
  status: AutomationStatus;
}

export interface AutomationResult {
  branchName?: string;
  commitSha?: string;
  dryRun: boolean;
  message: string;
  prNumber?: number;
  prUrl?: string;
  status: AutomationStatus;
  steps: AutomationStep[];
  workflow: 'issue-to-pr' | 'pr-review' | 'ci-fix' | 'mention-command' | 'unknown';
}

export interface IssueAutomationContext {
  body?: string | null;
  number: number;
  title: string;
  url?: string;
}

export interface PullRequestAutomationContext {
  base: string;
  head: string;
  number: number;
  title: string;
  url?: string;
}

export interface AutomationPermissionConfig {
  allowComment: boolean;
  allowCommit: boolean;
  allowPrCreate: boolean;
  allowReview: boolean;
  allowedActors?: string[];
  allowedRepos?: string[];
  deniedActors?: string[];
}

export const DEFAULT_AUTOMATION_PERMISSIONS: AutomationPermissionConfig = {
  allowComment: false,
  allowCommit: false,
  allowPrCreate: false,
  allowReview: false,
};
