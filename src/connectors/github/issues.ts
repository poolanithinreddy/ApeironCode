import type {GitHubIssue} from '../types.js';
import type {GitHubClient} from './client.js';

interface GitHubIssueResponse {
  body?: string | null;
  html_url?: string;
  labels?: Array<{name?: string}>;
  number: number;
  pull_request?: unknown;
  state: string;
  title: string;
  updated_at?: string;
}

const mapIssue = (issue: GitHubIssueResponse): GitHubIssue => ({
  body: issue.body,
  htmlUrl: issue.html_url,
  labels: (issue.labels ?? []).map((label) => label.name).filter((name): name is string => Boolean(name)),
  number: issue.number,
  state: issue.state,
  title: issue.title,
  updatedAt: issue.updated_at,
});

export const listGitHubIssues = async (client: GitHubClient): Promise<GitHubIssue[]> => {
  const issues = await client.request<GitHubIssueResponse[]>('/issues?state=open&per_page=20');
  return issues.filter((issue) => !issue.pull_request).map(mapIssue);
};

export const getGitHubIssue = async (client: GitHubClient, number: number): Promise<GitHubIssue> =>
  mapIssue(await client.request<GitHubIssueResponse>(`/issues/${number}`));

export const createGitHubIssueComment = async (
  client: GitHubClient,
  number: number,
  body: string,
): Promise<{htmlUrl?: string; id: number}> => {
  const response = await client.request<{html_url?: string; id: number}>(`/issues/${number}/comments`, {
    body: JSON.stringify({body}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  return {htmlUrl: response.html_url, id: response.id};
};

export const createGitHubIssue = async (
  client: GitHubClient,
  input: {body?: string; title: string},
): Promise<{htmlUrl?: string; number: number}> => {
  const response = await client.request<{html_url?: string; number: number}>('/issues', {
    body: JSON.stringify({body: input.body ?? '', title: input.title}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  return {htmlUrl: response.html_url, number: response.number};
};
