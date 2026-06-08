import {describe, it, expect, vi} from 'vitest';
import {GitHubClient} from '../../src/connectors/github/client.js';
import {prepareInlineReviewComments, runPrReviewAutomation} from '../../src/githubAutomation/prReview.js';
import {loadAutomationPermissionsFromEnv} from '../../src/githubAutomation/permissions.js';

const buildMockClient = (responses: Record<string, unknown>, calls: string[]): GitHubClient => {
  const fetchImpl = vi.fn((url: string, init?: {body?: string; method?: string}) => {
    const path = url.replace('https://api.github.com/repos/o/r', '');
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
    env: {GITHUB_TOKEN: 'tok'},
    fetchImpl: fetchImpl as unknown as typeof fetch,
    repo: {name: 'r', owner: 'o', remoteUrl: ''},
  });
};

describe('runPrReviewAutomation', () => {
  it('runs review in dry-run by default', async () => {
    const calls: string[] = [];
    const client = buildMockClient({
      'GET /pulls/7': {base: {ref: 'main'}, head: {ref: 'feat'}, html_url: 'u', labels: [], number: 7, state: 'open', title: 'PR'},
      'GET /pulls/7/files': [{filename: 'a.ts', status: 'modified', additions: 10, deletions: 2, changes: 12}],
    }, calls);
    const result = await runPrReviewAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      options: {dryRun: true},
      prNumber: 7,
      runAgent: () => Promise.resolve({comments: [], summary: 'Looks good.'}),
    });
    expect(result.status).toBe('succeeded');
    expect(result.dryRun).toBe(true);
    expect(calls).not.toContain('POST /pulls/7/reviews');
  });

  it('refuses to submit review without permission', async () => {
    const calls: string[] = [];
    const client = buildMockClient({
      'GET /pulls/7': {base: {ref: 'main'}, head: {ref: 'feat'}, html_url: 'u', labels: [], number: 7, state: 'open', title: 'PR'},
      'GET /pulls/7/files': [],
    }, calls);
    const result = await runPrReviewAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      options: {dryRun: false},
      prNumber: 7,
      runAgent: () => Promise.resolve({summary: 'NIT'}),
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('permission denied');
    expect(calls).not.toContain('POST /pulls/7/reviews');
  });

  it('formats severities, suppresses duplicates, and falls back when no position exists', () => {
    const prepared = prepareInlineReviewComments([
      {body: 'blocking regression here', path: 'a.ts', position: 3},
      {body: 'blocking regression here', path: 'a.ts', position: 3},
      {body: 'could this be simpler?', path: 'b.ts'},
    ]);
    expect(prepared.inline).toHaveLength(1);
    expect(prepared.inline[0]?.body).toContain('[blocking]');
    expect(prepared.fallbackSummary).toHaveLength(1);
    expect(prepared.fallbackSummary[0]).toContain('[question]');
  });

  it('submits prepared inline comments when permitted', async () => {
    const calls: string[] = [];
    const client = buildMockClient({
      'GET /pulls/7': {base: {ref: 'main'}, head: {ref: 'feat'}, html_url: 'u', labels: [], number: 7, state: 'open', title: 'PR'},
      'GET /pulls/7/files': [],
      'GET /issues/7/comments': [],
      'POST /pulls/7/reviews': {id: 1, state: 'commented'},
    }, calls);
    const result = await runPrReviewAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({
        OPENCODE_AUTOMATION: '1',
        OPENCODE_AUTOMATION_REVIEW: '1',
      }),
      options: {dryRun: false},
      prNumber: 7,
      runAgent: () => Promise.resolve({comments: [{body: 'nit: use const', path: 'a.ts', position: 1}], summary: 'Review'}),
    });
    expect(result.status).toBe('succeeded');
    expect(calls).toContain('POST /pulls/7/reviews');
  });
});
