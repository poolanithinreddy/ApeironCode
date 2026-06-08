import {describe, it, expect, vi} from 'vitest';
import {GitHubClient} from '../../src/connectors/github/client.js';
import {createBranch, getDefaultBranch, getRefSha} from '../../src/connectors/github/branches.js';
import {commitFiles} from '../../src/connectors/github/commits.js';
import {parseGitHubWebhookPayload, parseMentionCommand} from '../../src/connectors/github/webhooks.js';
import {listCheckRuns, formatFailedCheckSummary} from '../../src/connectors/github/checks.js';
import {createPullRequestReview, listPullRequestComments} from '../../src/connectors/github/reviews.js';

const buildClient = (responses: Record<string, unknown>): GitHubClient => {
  const fetchImpl = vi.fn((url: string, init?: {method?: string}) => {
    const path = url.replace('https://api.github.com/repos/o/r', '');
    const cleanPath = path.split('?')[0] || '/';
    const key = `${init?.method ?? 'GET'} ${cleanPath}`;
    const body = responses[key];
    if (body === undefined) {
      return Promise.resolve(new Response(JSON.stringify({message: 'Not Found'}), {status: 404, statusText: 'Not Found'}));
    }
    return Promise.resolve(new Response(JSON.stringify(body), {status: 200, statusText: 'OK'}));
  });
  return new GitHubClient({
    env: {GITHUB_TOKEN: 'tok'},
    fetchImpl: fetchImpl as unknown as typeof fetch,
    repo: {name: 'r', owner: 'o', remoteUrl: ''},
  });
};

describe('github branches/commits/checks/reviews', () => {
  it('reads default branch from repo response', async () => {
    const client = buildClient({'GET /': {default_branch: 'develop'}});
    expect(await getDefaultBranch(client)).toBe('develop');
  });

  it('returns null when ref missing', async () => {
    const client = buildClient({});
    expect(await getRefSha(client, 'heads/missing')).toBeNull();
  });

  it('creates a branch using a source ref', async () => {
    const client = buildClient({
      'GET /git/ref/heads/main': {object: {sha: 'abc123'}},
      'POST /git/refs': {object: {sha: 'abc123'}},
    });
    const branch = await createBranch(client, 'feature-x', 'heads/main');
    expect(branch.name).toBe('feature-x');
    expect(branch.sha).toBe('abc123');
  });

  it('commits files via tree+commit+ref update', async () => {
    const client = buildClient({
      'GET /git/ref/heads/feat': {object: {sha: 'parent'}},
      'GET /git/commits/parent': {tree: {sha: 'tree-base'}},
      'POST /git/trees': {sha: 'new-tree'},
      'POST /git/commits': {sha: 'new-commit', html_url: 'url'},
      'PATCH /git/refs/heads/feat': {object: {sha: 'new-commit'}},
    });
    const result = await commitFiles(client, 'feat', [{path: 'a.ts', content: 'export {};'}], 'msg');
    expect(result.sha).toBe('new-commit');
    expect(result.htmlUrl).toBe('url');
  });

  it('parses webhook payload and extracts mention command', () => {
    const ctx = parseGitHubWebhookPayload({
      action: 'created',
      comment: {body: '@opencode implement', id: 1},
      issue: {number: 5, pull_request: {url: 'x'}},
      repository: {full_name: 'o/r'},
      sender: {login: 'alice'},
    }, 'issue_comment');
    expect(ctx.eventType).toBe('issue_comment');
    expect(ctx.prNumber).toBe(5);
    const mention = parseMentionCommand(ctx.commentBody);
    expect(mention?.command).toBe('implement');
  });

  it('formats failing check summary', async () => {
    const client = buildClient({
      'GET /commits/sha/check-runs': {check_runs: [
        {name: 'lint', conclusion: 'failure', status: 'completed', output: {title: 'lint failed', summary: 'x'}},
      ]},
    });
    const runs = await listCheckRuns(client, 'sha');
    expect(runs).toHaveLength(1);
    const text = formatFailedCheckSummary(runs);
    expect(text).toContain('lint');
    expect(text).toContain('lint failed');
  });

  it('lists PR comments via issue endpoint', async () => {
    const client = buildClient({
      'GET /issues/3/comments': [{id: 1, body: 'hi', user: {login: 'bob'}, created_at: 't'}],
    });
    const comments = await listPullRequestComments(client, 3);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.user).toBe('bob');
  });

  it('creates a PR review with comments', async () => {
    let captured: string | undefined;
    const fetchImpl = vi.fn((url: string, init?: {body?: string; method?: string}) => {
      captured = init?.body;
      return Promise.resolve(new Response(JSON.stringify({id: 99, state: 'COMMENTED'}), {status: 200}));
    });
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'tok'},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repo: {name: 'r', owner: 'o', remoteUrl: ''},
    });
    await createPullRequestReview(client, 11, [{body: 'nit', path: 'a.ts', line: 5}], 'overall', 'COMMENT');
    expect(captured).toContain('"event":"COMMENT"');
    expect(captured).toContain('"comments"');
  });
});
