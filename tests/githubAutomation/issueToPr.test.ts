import {describe, it, expect, vi} from 'vitest';
import {GitHubClient} from '../../src/connectors/github/client.js';
import {runIssueToPrAutomation} from '../../src/githubAutomation/issueToPr.js';
import {loadAutomationPermissionsFromEnv} from '../../src/githubAutomation/permissions.js';

const buildMockClient = (responses: Record<string, unknown>, calls: string[]): GitHubClient => {
  const fetchImpl = vi.fn((url: string, init?: {body?: string; method?: string}) => {
    const path = url.replace('https://api.github.com/repos/test-owner/test-repo', '');
    const cleanPath = path.split('?')[0] || '/';
    const key = `${init?.method ?? 'GET'} ${cleanPath}`;
    calls.push(key);
    const body = responses[key];
    if (body === undefined) {
      return Promise.resolve(new Response(JSON.stringify({message: 'Not Found'}), {status: 404, statusText: 'Not Found'}));
    }
    return Promise.resolve(new Response(JSON.stringify(body), {status: 200, statusText: 'OK'}));
  });
  return new GitHubClient({
    env: {GITHUB_TOKEN: 'test-token'},
    fetchImpl: fetchImpl as unknown as typeof fetch,
    repo: {name: 'test-repo', owner: 'test-owner', remoteUrl: 'https://github.com/test-owner/test-repo.git'},
  });
};

describe('runIssueToPrAutomation', () => {
  it('returns dry-run result without performing writes', async () => {
    const calls: string[] = [];
    const client = buildMockClient({
      'GET /issues/42': {body: 'Issue body', html_url: 'url', labels: [], number: 42, state: 'open', title: 'Issue title'},
      'GET /': {default_branch: 'main'},
    }, calls);
    const result = await runIssueToPrAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      issueNumber: 42,
      options: {dryRun: true},
    });
    expect(result.status).toBe('succeeded');
    expect(result.dryRun).toBe(true);
    expect(result.branchName).toBe('apeironcode/issue-42-issue-title');
    expect(calls).not.toContain('POST /git/refs');
    expect(calls).not.toContain('POST /pulls');
  });

  it('falls back to numbered branch suffix when branch already exists', async () => {
    const calls: string[] = [];
    let createAttempts = 0;
    const fetchImpl = vi.fn((url: string, init?: {body?: string; method?: string}) => {
      const path = url.replace('https://api.github.com/repos/test-owner/test-repo', '');
      const cleanPath = path.split('?')[0] || '/';
      const key = `${init?.method ?? 'GET'} ${cleanPath}`;
      calls.push(key);
      if (key === 'GET /issues/42') {
        return Promise.resolve(new Response(JSON.stringify({body: 'Issue body', html_url: 'url', labels: [], number: 42, state: 'open', title: 'Fix login'}), {status: 200}));
      }
      if (key === 'GET /') {
        return Promise.resolve(new Response(JSON.stringify({default_branch: 'main'}), {status: 200}));
      }
      if (key === 'GET /git/ref/heads/main') {
        return Promise.resolve(new Response(JSON.stringify({object: {sha: 'base'}}), {status: 200}));
      }
      if (key === 'POST /git/refs') {
        createAttempts += 1;
        if (createAttempts === 1) {
          return Promise.resolve(new Response(JSON.stringify({message: 'Reference already exists'}), {status: 422, statusText: 'Unprocessable Entity'}));
        }
        return Promise.resolve(new Response(JSON.stringify({object: {sha: 'new'}}), {status: 200}));
      }
      if (key === 'POST /pulls') {
        const body = JSON.parse(init?.body ?? '{}') as {head?: string};
        expect(body.head).toBe('apeironcode/issue-42-fix-login-2');
        return Promise.resolve(new Response(JSON.stringify({html_url: 'pr-url', number: 12}), {status: 200}));
      }
      return Promise.resolve(new Response(JSON.stringify({id: 1}), {status: 200}));
    });
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'test-token'},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repo: {name: 'test-repo', owner: 'test-owner', remoteUrl: ''},
    });
    const result = await runIssueToPrAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({
        OPENCODE_AUTOMATION: '1',
        OPENCODE_AUTOMATION_COMMIT: '1',
        OPENCODE_AUTOMATION_PR_CREATE: '1',
      }),
      issueNumber: 42,
      options: {dryRun: false},
    });
    expect(result.branchName).toBe('apeironcode/issue-42-fix-login-2');
    expect(createAttempts).toBe(2);
  });

  it('reports failure when GitHub client missing token', async () => {
    const client = new GitHubClient({
      env: {},
      fetchImpl: vi.fn(),
      repo: {name: 'test-repo', owner: 'test-owner', remoteUrl: ''},
    });
    const result = await runIssueToPrAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      issueNumber: 1,
      options: {dryRun: true},
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('GITHUB_TOKEN');
  });
});
