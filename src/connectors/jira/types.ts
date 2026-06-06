export interface JiraUserRef {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

export interface JiraStatus {
  category?: string;
  id?: string;
  name: string;
}

export interface JiraIssueType {
  id?: string;
  name: string;
}

export interface JiraPriority {
  id?: string;
  name: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  url?: string;
}

export interface JiraIssue {
  assignee?: JiraUserRef | null;
  created?: string;
  description?: string | null;
  id: string;
  issueType?: JiraIssueType | null;
  key: string;
  priority?: JiraPriority | null;
  project?: JiraProject | null;
  reporter?: JiraUserRef | null;
  status?: JiraStatus | null;
  summary: string;
  updated?: string;
  url?: string;
}

export interface JiraComment {
  author?: JiraUserRef | null;
  body: string;
  created?: string;
  id: string;
}

export interface JiraSearchOptions {
  fields?: string[];
  maxResults?: number;
  startAt?: number;
}

export interface JiraCreateIssueInput {
  assigneeAccountId?: string;
  description?: string;
  issueTypeName?: string;
  priorityName?: string;
  projectKey: string;
  summary: string;
}

export interface JiraCreatedRef {
  id: string;
  key: string;
  url?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to?: JiraStatus;
}
