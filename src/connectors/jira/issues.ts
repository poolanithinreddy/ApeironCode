import type {JiraClient} from './client.js';
import type {
  JiraComment,
  JiraCreatedRef,
  JiraCreateIssueInput,
  JiraIssue,
  JiraIssueType,
  JiraPriority,
  JiraProject,
  JiraSearchOptions,
  JiraStatus,
  JiraTransition,
  JiraUserRef,
} from './types.js';

interface RawJiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

interface RawJiraStatus {
  id?: string;
  name?: string;
  statusCategory?: {key?: string; name?: string};
}

interface RawJiraIssueType {
  id?: string;
  name?: string;
}

interface RawJiraPriority {
  id?: string;
  name?: string;
}

interface RawJiraProject {
  id?: string;
  key?: string;
  name?: string;
  projectTypeKey?: string;
}

interface RawJiraIssue {
  fields?: {
    assignee?: RawJiraUser | null;
    created?: string;
    description?: string | null;
    issuetype?: RawJiraIssueType | null;
    priority?: RawJiraPriority | null;
    project?: RawJiraProject | null;
    reporter?: RawJiraUser | null;
    status?: RawJiraStatus | null;
    summary?: string;
    updated?: string;
  };
  id: string;
  key: string;
  self?: string;
}

const mapUser = (user: RawJiraUser | null | undefined): JiraUserRef | null => {
  if (!user) {
    return null;
  }
  return {
    accountId: user.accountId,
    displayName: user.displayName,
    emailAddress: user.emailAddress,
  };
};

const mapStatus = (status: RawJiraStatus | null | undefined): JiraStatus | null => {
  if (!status?.name) {
    return null;
  }
  return {
    category: status.statusCategory?.key ?? status.statusCategory?.name,
    id: status.id,
    name: status.name,
  };
};

const mapIssueType = (type: RawJiraIssueType | null | undefined): JiraIssueType | null => {
  if (!type?.name) {
    return null;
  }
  return {id: type.id, name: type.name};
};

const mapPriority = (priority: RawJiraPriority | null | undefined): JiraPriority | null => {
  if (!priority?.name) {
    return null;
  }
  return {id: priority.id, name: priority.name};
};

const mapProject = (project: RawJiraProject | null | undefined): JiraProject | null => {
  if (!project?.id || !project.key || !project.name) {
    return null;
  }
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    projectTypeKey: project.projectTypeKey,
  };
};

const buildIssueUrl = (baseUrl: string, key: string): string => `${baseUrl}/browse/${key}`;

const mapIssue = (issue: RawJiraIssue, baseUrl: string): JiraIssue => ({
  assignee: mapUser(issue.fields?.assignee),
  created: issue.fields?.created,
  description: issue.fields?.description ?? null,
  id: issue.id,
  issueType: mapIssueType(issue.fields?.issuetype),
  key: issue.key,
  priority: mapPriority(issue.fields?.priority),
  project: mapProject(issue.fields?.project),
  reporter: mapUser(issue.fields?.reporter),
  status: mapStatus(issue.fields?.status),
  summary: issue.fields?.summary ?? '',
  updated: issue.fields?.updated,
  url: buildIssueUrl(baseUrl, issue.key),
});

const DEFAULT_FIELDS = ['summary', 'status', 'assignee', 'reporter', 'priority', 'issuetype', 'project', 'created', 'updated'];

export const buildJql = (parts: {
  assignee?: string;
  project?: string;
  status?: string;
  text?: string;
}): string => {
  const clauses: string[] = [];
  if (parts.project) {
    clauses.push(`project = "${parts.project}"`);
  }
  if (parts.status) {
    clauses.push(`status = "${parts.status}"`);
  }
  if (parts.assignee) {
    clauses.push(`assignee = "${parts.assignee}"`);
  }
  if (parts.text) {
    clauses.push(`text ~ "${parts.text.replace(/"/g, '\\"')}"`);
  }
  return clauses.join(' AND ');
};

export const searchJiraIssues = async (
  client: JiraClient,
  jql: string,
  options: JiraSearchOptions = {},
): Promise<JiraIssue[]> => {
  const data = await client.request<{issues: RawJiraIssue[]}>('/rest/api/3/search', {
    body: JSON.stringify({
      fields: options.fields ?? DEFAULT_FIELDS,
      jql,
      maxResults: options.maxResults ?? 25,
      startAt: options.startAt ?? 0,
    }),
    method: 'POST',
  });
  return (data.issues ?? []).map((issue) => mapIssue(issue, client.baseUrl));
};

export const getJiraIssue = async (client: JiraClient, key: string): Promise<JiraIssue> => {
  const data = await client.request<RawJiraIssue>(`/rest/api/3/issue/${encodeURIComponent(key)}`);
  return mapIssue(data, client.baseUrl);
};

const buildAdfDescription = (text: string): {content: Array<{content: Array<{text: string; type: string}>; type: string}>; type: string; version: number} => ({
  content: [
    {
      content: [{text, type: 'text'}],
      type: 'paragraph',
    },
  ],
  type: 'doc',
  version: 1,
});

export const createJiraIssue = async (
  client: JiraClient,
  input: JiraCreateIssueInput,
): Promise<JiraCreatedRef> => {
  const fields: Record<string, unknown> = {
    issuetype: {name: input.issueTypeName ?? 'Task'},
    project: {key: input.projectKey},
    summary: input.summary,
  };
  if (input.description) {
    fields.description = buildAdfDescription(input.description);
  }
  if (input.assigneeAccountId) {
    fields.assignee = {accountId: input.assigneeAccountId};
  }
  if (input.priorityName) {
    fields.priority = {name: input.priorityName};
  }
  const data = await client.request<{id: string; key: string; self?: string}>('/rest/api/3/issue', {
    body: JSON.stringify({fields}),
    method: 'POST',
  });
  return {id: data.id, key: data.key, url: `${client.baseUrl}/browse/${data.key}`};
};

export const addJiraComment = async (
  client: JiraClient,
  issueKey: string,
  body: string,
): Promise<JiraComment> => {
  const data = await client.request<{author?: RawJiraUser; body?: unknown; created?: string; id: string}>(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    {
      body: JSON.stringify({body: buildAdfDescription(body)}),
      method: 'POST',
    },
  );
  return {
    author: mapUser(data.author),
    body,
    created: data.created,
    id: data.id,
  };
};

export const transitionJiraIssue = async (
  client: JiraClient,
  issueKey: string,
  transitionId: string,
): Promise<void> => {
  await client.request<void>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    body: JSON.stringify({transition: {id: transitionId}}),
    method: 'POST',
  });
};

export const listJiraTransitions = async (
  client: JiraClient,
  issueKey: string,
): Promise<JiraTransition[]> => {
  const data = await client.request<{transitions?: Array<{id: string; name: string; to?: RawJiraStatus}>}>(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
  );
  return (data.transitions ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    to: mapStatus(t.to) ?? undefined,
  }));
};
