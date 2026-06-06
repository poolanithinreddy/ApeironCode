export type ConnectorPermission =
  | 'GitHubComment'
  | 'GitHubPRCreate'
  | 'GitHubRead'
  | 'GitHubWrite'
  | 'JiraRead'
  | 'JiraWrite'
  | 'LinearRead'
  | 'LinearWrite'
  | 'SlackRead'
  | 'SlackWrite';

export interface ConnectorStatus {
  configured: boolean;
  detail: string;
  name: string;
  permissions: ConnectorPermission[];
}

export interface GitHubIssue {
  body?: string | null;
  htmlUrl?: string;
  labels: string[];
  number: number;
  state: string;
  title: string;
  updatedAt?: string;
}

export interface GitHubPullRequest extends GitHubIssue {
  base?: string;
  head?: string;
}

export interface GitHubPullFile {
  additions?: number;
  changes?: number;
  deletions?: number;
  filename: string;
  status: string;
}

export interface GitHubActionsRun {
  conclusion?: string | null;
  htmlUrl?: string;
  id: number;
  name: string;
  status: string;
  updatedAt?: string;
}

export interface GitHubActionsJob {
  conclusion?: string | null;
  htmlUrl?: string;
  id: number;
  name: string;
  status: string;
  steps: Array<{
    conclusion?: string | null;
    name: string;
    status?: string;
  }>;
}
