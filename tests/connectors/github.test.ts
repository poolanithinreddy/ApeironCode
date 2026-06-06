import {describe, expect, it, vi} from 'vitest';

import {GitHubClient} from '../../src/connectors/github/client.js';
import {formatConnectorStatus, formatGitHubIssueList, formatGitHubWritePreview} from '../../src/connectors/github/format.js';
import {createGitHubIssue, listGitHubIssues} from '../../src/connectors/github/issues.js';
import {formatGitHubActionsRuns, formatGitHubCiExplanation, listGitHubActionsJobs, listGitHubActionsRuns} from '../../src/connectors/github/actions.js';
import {buildPrSummaryReport, createGitHubPull, getGitHubPull, listGitHubPullFiles} from '../../src/connectors/github/pulls.js';
import {parseGitHubRemote} from '../../src/connectors/github/repos.js';

describe('github connector', () => {
  it('detects GitHub remotes and never formats token values', () => {
    const repo = parseGitHubRemote('git@github.com:openai/example.git');
    expect(repo).toMatchObject({name: 'example', owner: 'openai'});
    const formatted = formatConnectorStatus({
      configured: true,
      detail: 'repo openai/example; token from GITHUB_TOKEN',
      name: 'github',
      permissions: ['GitHubRead'],
    });
    expect(formatted).not.toContain('secret-token');
  });

  it('lists mocked issues without network', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify([{
      body: 'body',
      labels: [{name: 'bug'}],
      number: 1,
      state: 'open',
      title: 'Fix parser',
    }]), {status: 200})));
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'secret-token'},
      fetchImpl,
      repo: {name: 'repo', owner: 'owner', remoteUrl: 'https://github.com/owner/repo.git'},
    });
    const issues = await listGitHubIssues(client);
    expect(issues[0]?.title).toBe('Fix parser');
    expect(formatGitHubIssueList(issues)).toContain('#1 Fix parser');
    const calls = fetchImpl.mock.calls as unknown as Array<[string, {headers?: Record<string, string>}]>;
    expect(calls[0]?.[1].headers).toMatchObject({authorization: 'Bearer secret-token'});
  });

  it('creates mocked issues and PRs with redacted previews', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({html_url: 'https://github.com/owner/repo/issues/2', number: 2}), {status: 201}))
      .mockResolvedValueOnce(new Response(JSON.stringify({html_url: 'https://github.com/owner/repo/pull/3', number: 3}), {status: 201}));
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'secret-token'},
      fetchImpl,
      repo: {name: 'repo', owner: 'owner', remoteUrl: 'https://github.com/owner/repo.git'},
    });

    const preview = formatGitHubWritePreview({
      body: 'Title: Test\nAPI_KEY=secret',
      target: 'new issue',
      type: 'issue-create',
    });
    expect(preview).toContain('[REDACTED]');

    expect(await createGitHubIssue(client, {body: 'body', title: 'Issue'})).toMatchObject({number: 2});
    expect(await createGitHubPull(client, {base: 'main', body: 'body', head: 'branch', title: 'PR'})).toMatchObject({number: 3});
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/issues'), expect.objectContaining({method: 'POST'}));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining('/pulls'), expect.objectContaining({method: 'POST'}));
  });

  it('summarizes mocked PR files', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        base: {ref: 'main'},
        body: 'Adds auth checks',
        head: {ref: 'feature/auth'},
        number: 5,
        state: 'open',
        title: 'Auth hardening',
      }), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {additions: 10, changes: 12, deletions: 2, filename: 'src/auth.ts', status: 'modified'},
      ]), {status: 200}));
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'secret-token'},
      fetchImpl,
      repo: {name: 'repo', owner: 'owner', remoteUrl: 'https://github.com/owner/repo.git'},
    });

    const pull = await getGitHubPull(client, 5);
    const files = await listGitHubPullFiles(client, 5);
    const report = buildPrSummaryReport(pull, files);

    expect(report).toContain('PR Summary: #5 Auth hardening');
    expect(report).toContain('src/auth.ts');
  });

  it('lists mocked Actions runs and explains failed jobs', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        workflow_runs: [{conclusion: 'failure', id: 99, name: 'CI', status: 'completed', updated_at: '2026-05-02T00:00:00Z'}],
      }), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jobs: [{
          conclusion: 'failure',
          id: 100,
          name: 'test',
          status: 'completed',
          steps: [{conclusion: 'failure', name: 'npm test', status: 'completed'}],
        }],
      }), {status: 200}));
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'secret-token'},
      fetchImpl,
      repo: {name: 'repo', owner: 'owner', remoteUrl: 'https://github.com/owner/repo.git'},
    });

    const runs = await listGitHubActionsRuns(client);
    const jobs = await listGitHubActionsJobs(client, 99);

    expect(formatGitHubActionsRuns(runs)).toContain('99 | CI');
    expect(formatGitHubCiExplanation(jobs, 99)).toContain('failing step: npm test');
  });
});
