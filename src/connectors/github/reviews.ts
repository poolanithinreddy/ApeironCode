import type {GitHubClient} from './client.js';

export type GitHubReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

export interface GitHubReviewComment {
  body: string;
  line?: number;
  path: string;
  position?: number;
  side?: 'LEFT' | 'RIGHT';
}

export interface GitHubPullComment {
  body: string;
  createdAt?: string;
  htmlUrl?: string;
  id: number;
  user?: string;
}

interface RawIssueComment {
  body?: string;
  created_at?: string;
  html_url?: string;
  id: number;
  user?: {login?: string};
}

interface RawReviewResponse {
  body?: string;
  html_url?: string;
  id: number;
  state?: string;
}

const mapComment = (comment: RawIssueComment): GitHubPullComment => ({
  body: comment.body ?? '',
  createdAt: comment.created_at,
  htmlUrl: comment.html_url,
  id: comment.id,
  user: comment.user?.login,
});

export const listPullRequestComments = async (
  client: GitHubClient,
  prNumber: number,
): Promise<GitHubPullComment[]> => {
  const comments = await client.request<RawIssueComment[]>(`/issues/${prNumber}/comments?per_page=100`);
  return comments.map(mapComment);
};

export const commentOnPullRequest = async (
  client: GitHubClient,
  prNumber: number,
  body: string,
): Promise<{htmlUrl?: string; id: number}> => {
  const response = await client.request<{html_url?: string; id: number}>(`/issues/${prNumber}/comments`, {
    body: JSON.stringify({body}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  return {htmlUrl: response.html_url, id: response.id};
};

export const createPullRequestReview = async (
  client: GitHubClient,
  prNumber: number,
  comments: GitHubReviewComment[],
  summary: string,
  event: GitHubReviewEvent = 'COMMENT',
): Promise<{htmlUrl?: string; id: number; state?: string}> => {
  const payload: Record<string, unknown> = {
    body: summary,
    event,
  };
  if (comments.length > 0) {
    payload.comments = comments.map((c) => ({
      body: c.body,
      line: c.line,
      path: c.path,
      position: c.position,
      side: c.side,
    }));
  }
  const response = await client.request<RawReviewResponse>(`/pulls/${prNumber}/reviews`, {
    body: JSON.stringify(payload),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  return {htmlUrl: response.html_url, id: response.id, state: response.state};
};

export const updatePullRequest = async (
  client: GitHubClient,
  prNumber: number,
  input: {body?: string; state?: 'open' | 'closed'; title?: string},
): Promise<{htmlUrl?: string; number: number}> => {
  const response = await client.request<{html_url?: string; number: number}>(`/pulls/${prNumber}`, {
    body: JSON.stringify(input),
    headers: {'content-type': 'application/json'},
    method: 'PATCH',
  });
  return {htmlUrl: response.html_url, number: response.number};
};
