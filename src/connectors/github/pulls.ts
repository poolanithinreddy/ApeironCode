import type {GitHubPullFile, GitHubPullRequest} from '../types.js';
import type {GitHubClient} from './client.js';

interface GitHubPullResponse {
  base?: {ref?: string};
  body?: string | null;
  head?: {ref?: string};
  html_url?: string;
  labels?: Array<{name?: string}>;
  number: number;
  state: string;
  title: string;
  updated_at?: string;
}

const mapPull = (pull: GitHubPullResponse): GitHubPullRequest => ({
  base: pull.base?.ref,
  body: pull.body,
  head: pull.head?.ref,
  htmlUrl: pull.html_url,
  labels: (pull.labels ?? []).map((label) => label.name).filter((name): name is string => Boolean(name)),
  number: pull.number,
  state: pull.state,
  title: pull.title,
  updatedAt: pull.updated_at,
});

export const listGitHubPulls = async (client: GitHubClient): Promise<GitHubPullRequest[]> =>
  (await client.request<GitHubPullResponse[]>('/pulls?state=open&per_page=20')).map(mapPull);

export const getGitHubPull = async (client: GitHubClient, number: number): Promise<GitHubPullRequest> =>
  mapPull(await client.request<GitHubPullResponse>(`/pulls/${number}`));

export const listGitHubPullFiles = async (client: GitHubClient, number: number): Promise<GitHubPullFile[]> =>
  client.request<GitHubPullFile[]>(`/pulls/${number}/files?per_page=100`);

export const buildPrSummaryReport = (pull: GitHubPullRequest, files: GitHubPullFile[] = []): string => {
  const totals = files.reduce((acc, file) => ({
    additions: acc.additions + (file.additions ?? 0),
    changes: acc.changes + (file.changes ?? 0),
    deletions: acc.deletions + (file.deletions ?? 0),
  }), {additions: 0, changes: 0, deletions: 0});
  return [
    `PR Summary: #${pull.number} ${pull.title}`,
    `State: ${pull.state}`,
    `Branches: ${pull.head ?? '?'} -> ${pull.base ?? '?'}`,
    pull.htmlUrl ? `URL: ${pull.htmlUrl}` : null,
    '',
    `Changed files: ${files.length}`,
    `Lines: +${totals.additions} -${totals.deletions} (${totals.changes} changed)`,
    ...files.slice(0, 20).map((file) => `- ${file.filename} | ${file.status} | +${file.additions ?? 0} -${file.deletions ?? 0}`),
    files.length > 20 ? `... ${files.length - 20} more file(s)` : null,
    '',
    pull.body?.trim() || 'No PR body provided.',
  ].filter(Boolean).join('\n');
};

export const buildLocalPrReviewReport = (pull: GitHubPullRequest, diffSummary = 'Diff not fetched.'): string => [
  `# PR Review: #${pull.number} ${pull.title}`,
  '',
  `State: ${pull.state}`,
  `Branches: ${pull.head ?? '?'} -> ${pull.base ?? '?'}`,
  pull.htmlUrl ? `URL: ${pull.htmlUrl}` : null,
  '',
  '## Summary',
  pull.body?.trim() || 'No PR body provided.',
  '',
  '## Local Review Notes',
  diffSummary,
  '',
  'Posting comments requires explicit GitHubComment approval.',
].filter(Boolean).join('\n');

export const createGitHubPull = async (
  client: GitHubClient,
  input: {base: string; body?: string; head: string; title: string},
): Promise<{htmlUrl?: string; number: number}> => {
  const response = await client.request<{html_url?: string; number: number}>('/pulls', {
    body: JSON.stringify({
      base: input.base,
      body: input.body ?? '',
      head: input.head,
      title: input.title,
    }),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  return {htmlUrl: response.html_url, number: response.number};
};
