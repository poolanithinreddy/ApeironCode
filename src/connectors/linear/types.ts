export interface LinearUserRef {
  displayName?: string;
  id: string;
  name: string;
}

export interface LinearTeamRef {
  id: string;
  key?: string;
  name: string;
}

export interface LinearStateRef {
  id: string;
  name: string;
  type?: string;
}

export interface LinearIssue {
  assignee?: LinearUserRef | null;
  createdAt?: string;
  description?: string | null;
  id: string;
  identifier: string;
  priority?: number;
  state?: LinearStateRef | null;
  team?: LinearTeamRef | null;
  title: string;
  updatedAt?: string;
  url?: string;
}

export interface LinearComment {
  body: string;
  createdAt?: string;
  id: string;
  user?: LinearUserRef | null;
}

export interface LinearProject {
  description?: string | null;
  id: string;
  name: string;
  slugId?: string;
  state?: string;
  url?: string;
}

export interface LinearListIssuesOptions {
  assigneeId?: string;
  first?: number;
  stateType?: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled' | 'triage';
  teamId?: string;
}

export interface LinearCreateIssueInput {
  assigneeId?: string;
  description?: string;
  priority?: number;
  stateId?: string;
  teamId: string;
  title: string;
}

export interface LinearUpdateIssueInput {
  assigneeId?: string;
  description?: string;
  priority?: number;
  stateId?: string;
  title?: string;
}

export interface LinearCreatedRef {
  id: string;
  identifier?: string;
  url?: string;
}
